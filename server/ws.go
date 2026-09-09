package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

func timeNowAddSecs(secs int64) time.Time { return time.Now().Add(time.Duration(secs) * time.Second) }

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var (
	wsMu      sync.Mutex
	wsConns   = map[*websocket.Conn]bool{}
)

func serveWS(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.Path != "/ws" {
		return false
	}
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return true
	}
	wsMu.Lock()
	wsConns[conn] = true
	wsMu.Unlock()
	go func() {
		defer func() {
			wsMu.Lock()
			delete(wsConns, conn)
			wsMu.Unlock()
			conn.Close()
		}()
		conn.SetReadLimit(1 << 20)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
	return true
}

// broadcastWsMessage pushes {"name":..., "data":...} to every dashboard client.
func broadcastWsMessage(message any) {
	payload, err := json.Marshal(message)
	if err != nil {
		return
	}
	wsMu.Lock()
	defer wsMu.Unlock()
	for conn := range wsConns {
		conn.SetWriteDeadline(timeNowAddSecs(5))
		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			conn.Close()
			delete(wsConns, conn)
		}
	}
}
