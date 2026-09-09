package main

import (
	"os"
	"path/filepath"
	"strings"
)

// deliverToMaildir writes tmp/ then renames into new/ (atomic delivery).
func sanitizeMaildirName(name string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			sb.WriteRune(r)
		} else {
			sb.WriteByte('_')
		}
	}
	out := sb.String()
	if len(out) > 100 {
		out = out[:100]
	}
	if out == "" {
		return "_unknown"
	}
	return out
}

func deliverToMaildir(root, folder string, raw []byte) string {
	safeFolder := sanitizeMaildirName(folder)
	folderDir := filepath.Join(root, safeFolder)
	tmpDir := filepath.Join(folderDir, "tmp")
	newDir := filepath.Join(folderDir, "new")
	os.MkdirAll(tmpDir, 0o755)
	os.MkdirAll(newDir, 0o755)

	name := maildirFileName()
	tmpPath := filepath.Join(tmpDir, name)
	newPath := filepath.Join(newDir, name)
	os.WriteFile(tmpPath, raw, 0o644)
	os.Rename(tmpPath, newPath)
	return newPath
}

func maildirFileName() string {
	return itoa64(nowMillis()) + ".M" + itoa64(int64(os.Getpid())) + nanoID(10)
}

func itoa64(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [24]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// walkFiles yields all regular files under dir, skipping dotfiles.
func walkFiles(dir string, fn func(path string)) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		full := filepath.Join(dir, entry.Name())
		if entry.IsDir() {
			walkFiles(full, fn)
		} else if entry.Type().IsRegular() {
			fn(full)
		}
	}
}
