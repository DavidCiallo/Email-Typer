package main

import (
	"fmt"
	"log"
	"net/http"
)

// CFRS-Email Go server — drop-in replacement for the Bun server:
// same routes, same request/response envelope, same token crypto,
// SQLite storage instead of JSONL, bodies hydrated from the eml archive.

func registerRoutes() {
	apiHandlers["/api/auth/login"] = authLogin
	apiHandlers["/api/auth/alive"] = authAlive
	apiHandlers["/api/auth/register"] = authRegister
	apiHandlers["/api/auth/config"] = authConfig
	apiHandlers["/api/auth/verify"] = authVerify

	apiHandlers["/api/email/list"] = emailList
	apiHandlers["/api/email/detail"] = emailDetail
	apiHandlers["/api/email/send"] = emailSend
	apiHandlers["/api/email/receive"] = emailReceive
	apiHandlers["/api/email/scan"] = emailScan
	apiHandlers["/api/email/delete"] = emailDeleteHandler
	apiHandlers["/api/email/restore"] = emailRestoreHandler
	apiHandlers["/api/email/purge"] = emailPurgeHandler
	apiHandlers["/api/email/push"] = emailPush
	apiHandlers["/api/email/send-log/list"] = sendLogList
	apiHandlers["/api/email/send-log/update"] = sendLogUpdate
	apiHandlers["/api/email/attachment"] = emailAttachment

	apiHandlers["/api/strategy/list"] = strategyListHandler
	apiHandlers["/api/strategy/save"] = strategySaveHandler
	apiHandlers["/api/strategy/delete"] = strategyDeleteHandler

	apiHandlers["/api/account/list"] = accountListHandler
	apiHandlers["/api/account/create"] = accountCreateHandler
	apiHandlers["/api/account/update"] = accountUpdateHandler
	apiHandlers["/api/account/delete"] = accountDeleteHandler
	apiHandlers["/api/account/export"] = accountExportHandler
	apiHandlers["/api/account/import"] = accountImportHandler

	apiHandlers["/api/settings/list"] = settingsListHandler
	apiHandlers["/api/settings/save"] = settingsSaveHandler

	apiHandlers["/api/safety/list"] = safetyList
	apiHandlers["/api/safety/save"] = safetySave
	apiHandlers["/api/safety/delete"] = safetyDelete

	apiHandlers["/api/mailbox/list"] = mailboxList
	apiHandlers["/api/mailbox/save"] = mailboxSaveHandler
	apiHandlers["/api/mailbox/delete"] = mailboxDeleteHandler
	apiHandlers["/api/mailbox/addresses"] = mailboxAddresses
	apiHandlers["/api/mailbox/sync"] = mailboxSyncHandler
	apiHandlers["/api/mailbox/test"] = mailboxTestHandler
	apiHandlers["/api/mailbox/providers"] = mailboxProviders
	apiHandlers["/api/mailbox/grant-get"] = mailboxGrantGet
	apiHandlers["/api/mailbox/grant-create"] = mailboxGrantCreate
	apiHandlers["/api/mailbox/grant-revoke"] = mailboxGrantRevoke
	apiHandlers["/api/mailbox/grant-list"] = mailboxGrantList
	apiHandlers["/api/mailbox/tauth-info"] = mailboxTauthInfo
}

func main() {
	loadDotEnv(".env")
	loadDotEnv("../.env")
	loadDotEnv("../../.env")
	initPaths()
	initCrypto()

	if err := openDB(); err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	if err := migrateJSONL(); err != nil {
		log.Fatalf("JSONL migration failed: %v", err)
	}
	settingsLoad()

	// default admin from env (same as the Bun server's initialize)
	if name, email, password := envStr("ADMIN_NAME", ""), envStr("ADMIN_EMAIL", ""), envStr("ADMIN_PASSWORD", ""); name != "" && email != "" && password != "" {
		if accountFindIgnoreDeleteByEmail(email) == nil {
			if _, err := db.Exec(`INSERT INTO accounts (id, name, email, password, is_admin, create_time) VALUES (?,?,?,?,1,?)`,
				nanoID(6), name, email, hashGenerate(password), nowMillis()); err == nil {
				fmt.Printf("[Init] Admin account created: %s\n", email)
			}
		}
	}

	// link legacy inline bodies to archives is a TS-side migration concern;
	// the JSONL import already carries eml paths, so just warm the set
	warmIndexedEml()
	startEmailWatcher(maildirRoot())

	registerRoutes()

	server := &http.Server{
		Addr: fmt.Sprintf(":%d", port),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if serveWS(w, r) {
				return
			}
			if serveAPI(w, r) {
				return
			}
			if serveStatic(w, r) {
				return
			}
			http.NotFound(w, r)
		}),
	}
	fmt.Printf("\nServer is running at http://localhost:%d\n", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
