import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

// Only run the mock if we are in a normal web browser (not Tauri wrapper)
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  console.warn("⚠️ Running in browser. Activating Tauri API Mock Layer.");

  // Mock standard window
  mockWindows("main");

  // Local storage prefix/in-memory store for config keys
  const getStoreKey = (key: string) => `tauri_store_${key}`;

  mockIPC(
    async (cmd, args: any) => {
      console.log(`[Tauri Mock IPC] ${cmd}`, args);

      switch (cmd) {
        // Tauri Plugin Store mock
        case "plugin:store|load":
        case "plugin:store|get_store":
          return 1; // Mock Resource ID

        case "plugin:store|get": {
          const sKey = getStoreKey(args.key);
          const raw = localStorage.getItem(sKey);
          if (raw !== null) {
            try {
              return [JSON.parse(raw), true];
            } catch {
              return [raw, true];
            }
          }
          // Default initial settings if not stored
          if (args.key === "settings") {
            return [
              {
                language: "en",
                theme: "dark",
                performanceMode: false,
              },
              true,
            ];
          }
          return [undefined, false];
        }

        case "plugin:store|set": {
          const sKey = getStoreKey(args.key);
          localStorage.setItem(sKey, JSON.stringify(args.value));
          return null;
        }

        case "plugin:store|has": {
          const sKey = getStoreKey(args.key);
          return localStorage.getItem(sKey) !== null;
        }

        case "plugin:store|delete": {
          const sKey = getStoreKey(args.key);
          localStorage.removeItem(sKey);
          return true;
        }

        case "plugin:store|save":
          return null;

        // Tauri Plugin OS mock
        case "plugin:os|type":
          return "windows";

        // Tauri Plugin Updater mock
        case "plugin:updater|check":
          return null;

        // Custom application commands
        case "cmd_is_network_available":
          return true;

        case "cmd_check_connection":
          return localStorage.getItem("tauri_mock_logged_in") === "true";

        case "cmd_get_me":
          if (localStorage.getItem("tauri_mock_logged_in") === "true") {
            return {
              id: 12345,
              first_name: "Pratham",
              last_name: "Chauhan",
              username: "chauhan_pratham"
            };
          }
          return null;

        case "cmd_connect":
          return null;

        case "cmd_auth_request_code":
          return null;

        case "cmd_auth_qr_login":
          return "https://oauth.telegram.org/auth?bot_id=mock";

        case "cmd_auth_qr_poll":
          // Wait 2 seconds then succeed
          await new Promise((resolve) => setTimeout(resolve, 2000));
          localStorage.setItem("tauri_mock_logged_in", "true");
          return { success: true };

        case "cmd_auth_sign_in":
          localStorage.setItem("tauri_mock_logged_in", "true");
          return { success: true };

        case "cmd_auth_check_password":
          localStorage.setItem("tauri_mock_logged_in", "true");
          return { success: true };

        case "cmd_logout":
          localStorage.removeItem("tauri_mock_logged_in");
          return null;

        case "cmd_clean_cache":
          return null;

        case "cmd_get_groups":
          return [
            { id: 1, name: "Documents & Files", colorHex: "#3b82f6", order: 0 },
            { id: 2, name: "Media & Streams", colorHex: "#a855f7", order: 1 },
          ];

        case "cmd_get_enriched_folders":
        case "cmd_scan_folders":
          return [
            { id: "folder_1", name: "Personal Notes", group_id: 1, is_visible: true, order: 0, unread_count: 0 },
            { id: "folder_2", name: "Work Docs", group_id: 1, is_visible: true, order: 1, unread_count: 0 },
            { id: "folder_3", name: "Movies", group_id: 2, is_visible: true, order: 0, unread_count: 0 },
            { id: "folder_4", name: "Music Playlists", group_id: 2, is_visible: true, order: 1, unread_count: 0 },
          ];

        case "cmd_get_bandwidth":
          return { up_bytes: 1234567, down_bytes: 7654321 };

        case "cmd_list_cached_files":
        case "cmd_list_shares":
          return [];

        case "cmd_get_files": {
          const folderId = args.folderId;
          if (folderId === "folder_1") {
            return [
              { id: "f1", name: "Tax_Statement_2026.pdf", size: 1048576, date: "2026-07-15T12:00:00Z", mime_type: "application/pdf" },
              { id: "f2", name: "Notes.txt", size: 4096, date: "2026-07-14T09:30:00Z", mime_type: "text/plain" },
            ];
          } else if (folderId === "folder_3") {
            return [
              { id: "f3", name: "Sample_Video.mp4", size: 52428800, date: "2026-07-10T15:20:00Z", mime_type: "video/mp4" },
            ];
          } else if (folderId === "folder_4") {
            return [
              { id: "f4", name: "Background_Beat.mp3", size: 5242880, date: "2026-07-12T18:00:00Z", mime_type: "audio/mp3" },
            ];
          }
          return [];
        }

        case "cmd_get_pending_share_count":
          return 0;

        case "cmd_create_folder":
          return {
            id: `folder_${Math.random().toString(36).substr(2, 9)}`,
            name: args.name,
            group_id: 1,
            is_visible: true,
            order: 99,
            unread_count: 0,
          };

        case "cmd_get_api_settings":
          return { enabled: false, port: 8550, key_set: false, running: false };

        case "cmd_update_api_settings":
          return { enabled: args.enabled, port: args.port, key_set: true, running: args.enabled };

        case "cmd_regenerate_api_key":
          return "mock-api-key-12345-abcde";

        case "cmd_get_detailed_transcode_cache":
          return { entries: [], total_bytes: 0, max_bytes: 10737418240 };

        case "cmd_check_latency":
          return 42;

        case "cmd_detect_vpn":
          return false;

        case "cmd_get_proxy_status":
          return { reachable: true, latency_ms: 120 };

        case "cmd_delete_folder":
        case "cmd_rename_folder":
        case "cmd_create_group":
        case "cmd_delete_group":
        case "cmd_update_group":
        case "cmd_assign_folder_to_group":
        case "cmd_update_folder_order":
        case "cmd_update_group_order":
          return null;

        default:
          return null;
      }
    },
    { shouldMockEvents: true }
  );
}
