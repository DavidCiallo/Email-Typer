package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// ---------- request context / handler registry ----------

type Ctx struct {
	Auth    string
	Headers map[string]string
	RawBody string
	Body    map[string]any // merged: query params, then JSON body, then auth
}

func (c *Ctx) Decode(v any) error {
	b, err := json.Marshal(c.Body)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

type Handler func(c *Ctx) (any, error)

var apiHandlers = map[string]Handler{}

// rawResponse lets a handler write the HTTP response itself (attachment download).
type rawResponse func(w http.ResponseWriter)

var corsHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, token, Authorization, x-api-key",
}

func writeCORS(w http.ResponseWriter) {
	for k, v := range corsHeaders {
		w.Header().Set(k, v)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload string) {
	w.Header().Set("Content-Type", "application/json")
	writeCORS(w)
	w.WriteHeader(status)
	io.WriteString(w, payload)
}

func serveAPI(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodOptions {
		writeCORS(w)
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	handler, ok := apiHandlers[r.URL.Path]
	if !ok {
		return false
	}

	headers := map[string]string{}
	for k, v := range r.Header {
		headers[strings.ToLower(k)] = strings.Join(v, ",")
	}
	auth := r.Header.Get("token")
	if auth == "" {
		auth = r.Header.Get("x-api-key")
	}
	if auth == "" {
		auth = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}

	rawBody, _ := io.ReadAll(r.Body)
	body := map[string]any{}
	ct := r.Header.Get("Content-Type")
	if len(rawBody) > 0 && !strings.Contains(ct, "application/x-www-form-urlencoded") {
		dec := json.NewDecoder(strings.NewReader(string(rawBody)))
		dec.UseNumber()
		_ = dec.Decode(&body)
		if body == nil {
			body = map[string]any{}
		}
	}
	// query params first, body overrides (same merge order as the TS mount)
	for k, vs := range r.URL.Query() {
		if _, exists := body[k]; !exists && len(vs) > 0 {
			body[k] = vs[0]
		}
	}
	body["auth"] = auth
	body["__raw_body"] = string(rawBody)
	body["__headers"] = headers

	ctx := &Ctx{Auth: auth, Headers: headers, RawBody: string(rawBody), Body: body}

	result, err := func() (res any, herr error) {
		defer func() {
			if rec := recover(); rec != nil {
				res = nil
				herr = &handlerError{"Internal server error"}
			}
		}()
		return handler(ctx)
	}()

	if err != nil {
		msg := err.Error()
		if he, ok := err.(*handlerError); ok {
			msg = he.msg
		}
		payload, _ := json.Marshal(map[string]any{"success": false, "message": msg, "data": nil})
		writeJSON(w, http.StatusBadRequest, string(payload))
		return true
	}

	if raw, ok := result.(rawResponse); ok {
		raw(w)
		return true
	}
	payload, _ := json.Marshal(map[string]any{"success": true, "data": result})
	writeJSON(w, http.StatusOK, string(payload))
	return true
}

type handlerError struct{ msg string }

func (e *handlerError) Error() string { return e.msg }

func throwErr(msg string) error { return &handlerError{msg} }

// ---------- static SPA serving ----------

var contentTypes = map[string]string{
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8", ".json": "application/json",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
	".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff",
	".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
	".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".wasm": "application/wasm",
}

func serveStatic(w http.ResponseWriter, r *http.Request) bool {
	p := r.URL.Path
	if strings.HasSuffix(p, ".mjs") || strings.Contains(p, "..") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return true
	}
	filePath := filepath.Join(distDir, path.Clean("/"+p))
	if p == "/" {
		filePath = filepath.Join(distDir, "index.html")
	}
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		serveFile(w, r, filePath)
		return true
	}
	if !strings.HasPrefix(p, "/api") {
		serveFile(w, r, filepath.Join(distDir, "index.html"))
		return true
	}
	return false
}

func serveFile(w http.ResponseWriter, r *http.Request, filePath string) {
	f, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	defer f.Close()
	info, _ := f.Stat()
	ext := strings.ToLower(filepath.Ext(filePath))
	if ct, ok := contentTypes[ext]; ok {
		w.Header().Set("Content-Type", ct)
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
