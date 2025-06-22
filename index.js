#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs';

class OpentronsMCP {
  constructor() {
    this.server = new Server(
      {
        name: "opentrons-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.endpoints = [];
    this.setupTools();
    this.loadApiEndpoints();
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_endpoints",
            description: "Search Opentrons HTTP API endpoints by functionality, method, path, or any keyword",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query - searches across endpoint names, descriptions, paths, and tags"
                },
                method: {
                  type: "string",
                  description: "HTTP method filter (GET, POST, PUT, DELETE, PATCH)",
                  enum: ["GET", "POST", "PUT", "DELETE", "PATCH"]
                },
                tag: {
                  type: "string",
                  description: "Filter by API category/tag"
                },
                include_deprecated: {
                  type: "boolean",
                  description: "Include deprecated endpoints in results",
                  default: false
                }
              },
              required: ["query"]
            }
          },
          {
            name: "get_endpoint_details",
            description: "Get comprehensive details about a specific API endpoint",
            inputSchema: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  description: "HTTP method (GET, POST, etc.)"
                },
                path: {
                  type: "string",
                  description: "API endpoint path"
                }
              },
              required: ["method", "path"]
            }
          },
          {
            name: "list_by_category",
            description: "List all endpoints in a specific functional category",
            inputSchema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  description: "API category/tag to filter by",
                  enum: [
                    "Health", "Networking", "Control", "Settings", "Modules",
                    "Pipettes", "Calibration", "Run Management", "Protocol Management",
                    "Data files Management", "Simple Commands", "Flex Deck Configuration",
                    "Error Recovery Settings", "Attached Modules", "Attached Instruments",
                    "Labware Offset Management", "System Control", "Client Data",
                    "Maintenance Run Management", "Robot", "Subsystem Management"
                  ]
                }
              },
              required: ["category"]
            }
          },
          {
            name: "get_api_overview",
            description: "Get high-level overview of the Opentrons HTTP API structure and capabilities",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: "upload_protocol",
            description: "Upload a protocol file to an Opentrons robot",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address (e.g., '192.168.1.100')" },
                file_path: { type: "string", description: "Path to protocol file (.py or .json)" },
                protocol_kind: { type: "string", enum: ["standard", "quick-transfer"], default: "standard" },
                key: { type: "string", description: "Optional client tracking key (~100 chars)" },
                run_time_parameters: { type: "object", description: "Optional runtime parameter values" }
              },
              required: ["robot_ip", "file_path"]
            }
          },
          {
            name: "get_protocols", 
            description: "List all protocols stored on the robot",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                protocol_kind: { type: "string", enum: ["standard", "quick-transfer"], description: "Filter by protocol type (optional)" }
              },
              required: ["robot_ip"]
            }
          },
          {
            name: "create_run",
            description: "Create a new protocol run on the robot",
            inputSchema: {
              type: "object", 
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                protocol_id: { type: "string", description: "ID of protocol to run" },
                run_time_parameters: { type: "object", description: "Optional runtime parameter values" }
              },
              required: ["robot_ip", "protocol_id"]
            }
          },
          {
            name: "control_run",
            description: "Control run execution (play, pause, stop, resume)",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                run_id: { type: "string", description: "Run ID to control" },
                action: { type: "string", enum: ["play", "pause", "stop", "resume-from-recovery"], description: "Action to perform" }
              },
              required: ["robot_ip", "run_id", "action"]
            }
          },
          {
            name: "get_runs",
            description: "List all runs on the robot",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" }
              },
              required: ["robot_ip"]
            }
          },
          {
            name: "get_run_status",
            description: "Get detailed status of a specific run",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                run_id: { type: "string", description: "Run ID to check" }
              },
              required: ["robot_ip", "run_id"]
            }
          },
          {
            name: "robot_health",
            description: "Check robot health and connectivity",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" }
              },
              required: ["robot_ip"]
            }
          },
          {
            name: "control_lights",
            description: "Turn robot lights on or off",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                on: { type: "boolean", description: "True to turn lights on, false to turn off" }
              },
              required: ["robot_ip", "on"]
            }
          },
          {
            name: "home_robot",
            description: "Home robot axes or specific pipette",
            inputSchema: {
              type: "object",
              properties: {
                robot_ip: { type: "string", description: "Robot IP address" },
                target: { type: "string", enum: ["robot", "pipette"], default: "robot", description: "What to home" },
                mount: { type: "string", enum: ["left", "right"], description: "Which mount (required if target is 'pipette')" }
              },
              required: ["robot_ip"]
            }
          },
          {
            name: "poll_error_endpoint_and_fix",
            description: "Fetch specific JSON error report and automatically fix protocols",
            inputSchema: {
              type: "object",
              properties: {
                json_filename: { type: "string", default: "error_report_20250622_124746.json", description: "Name of JSON file to fetch" },
                original_protocol_path: { type: "string", default: "/Users/gene/Developer/failed-protocol-5.py", description: "Path to original protocol file" }
              }
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "search_endpoints":
          return this.searchEndpoints(args);
        case "get_endpoint_details":
          return this.getEndpointDetails(args);
        case "list_by_category":
          return this.listByCategory(args);
        case "get_api_overview":
          return this.getApiOverview();
        case "upload_protocol":
          return this.uploadProtocol(args);
        case "get_protocols":
          return this.getProtocols(args);
        case "create_run":
          return this.createRun(args);
        case "control_run":
          return this.controlRun(args);
        case "get_runs":
          return this.getRuns(args);
        case "get_run_status":
          return this.getRunStatus(args);
        case "robot_health":
          return this.robotHealth(args);
        case "control_lights":
          return this.controlLights(args);
        case "home_robot":
          return this.homeRobot(args);
        case "poll_error_endpoint_and_fix":
          return this.pollErrorEndpointAndFix(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  loadApiEndpoints() {
    // Comprehensive endpoint data extracted from Opentrons API docs and source code
    this.endpoints = [
      // Health & System
      {
        method: "GET",
        path: "/health",
        summary: "Get server health",
        description: "Get information about the health of the robot server. Use to check that the robot server is running and ready to operate. A 200 OK response means the server is running. Includes information about software and system.",
        tags: ["Health"],
        responses: {
          200: "Server is healthy - includes robot info, API version, firmware version, system version, logs links",
          422: "Unprocessable entity",
          503: "Service unavailable"
        }
      },
      {
        method: "GET",
        path: "/logs/{log_identifier}",
        summary: "Get troubleshooting logs",
        description: "Get the robot's troubleshooting logs. If you want protocol execution steps, use protocol analysis commands or run commands instead.",
        tags: ["Health"],
        parameters: [
          {
            name: "log_identifier",
            in: "path",
            required: true,
            description: "Type of log to retrieve",
            schema: {
              type: "string",
              enum: ["api.log", "serial.log", "can_bus.log", "server.log", "combined_api_server.log", "update_server.log", "touchscreen.log"]
            }
          },
          {
            name: "format",
            in: "query",
            description: "Format for log records",
            schema: { type: "string", enum: ["text", "json"], default: "text" }
          },
          {
            name: "records",
            in: "query",
            description: "Number of records to retrieve",
            schema: { type: "integer", minimum: 0, maximum: 100000, default: 50000 }
          }
        ]
      },

      // Networking
      {
        method: "GET",
        path: "/networking/status",
        summary: "Query network connectivity state",
        description: "Gets information about the robot's network interfaces including connectivity, addresses, and networking info",
        tags: ["Networking"],
        responses: {
          200: "Network interface information including IP addresses, MAC addresses, connection status for ethernet and wifi"
        }
      },
      {
        method: "GET",
        path: "/wifi/list",
        summary: "Scan for visible Wi-Fi networks",
        description: "Returns list of visible wifi networks with security and signal strength data",
        tags: ["Networking"],
        parameters: [
          {
            name: "rescan",
            in: "query",
            description: "If true, forces rescan for Wi-Fi networks. Expensive operation (~10 seconds)",
            schema: { type: "boolean", default: false }
          }
        ]
      },
      {
        method: "POST",
        path: "/wifi/configure",
        summary: "Configure robot's Wi-Fi",
        description: "Configures the wireless network interface to connect to a network",
        tags: ["Networking"],
        requestBody: {
          required: true,
          description: "WiFi configuration including SSID, security type, and credentials",
          properties: {
            ssid: { type: "string", description: "SSID to connect to" },
            hidden: { type: "boolean", default: false, description: "True if network is hidden" },
            securityType: { type: "string", description: "Security type (none, wpa-psk, wpa-eap)" },
            psk: { type: "string", description: "PSK for secured networks" },
            eapConfig: { type: "object", description: "EAP configuration for enterprise networks" }
          }
        }
      },
      {
        method: "GET",
        path: "/wifi/keys",
        summary: "Get Wi-Fi keys",
        description: "Get list of key files known to the system",
        tags: ["Networking"]
      },
      {
        method: "POST",
        path: "/wifi/keys",
        summary: "Add a Wi-Fi key",
        description: "Send a new key file to the robot",
        tags: ["Networking"],
        requestBody: {
          required: true,
          description: "Multipart form data with key file"
        }
      },
      {
        method: "DELETE",
        path: "/wifi/keys/{key_uuid}",
        summary: "Delete a Wi-Fi key",
        description: "Delete a key file from the robot",
        tags: ["Networking"],
        parameters: [
          {
            name: "key_uuid",
            in: "path",
            required: true,
            description: "ID of key to delete"
          }
        ]
      },
      {
        method: "GET",
        path: "/wifi/eap-options",
        summary: "Get EAP options",
        description: "Get supported EAP variants and their configuration parameters",
        tags: ["Networking"]
      },
      {
        method: "POST",
        path: "/wifi/disconnect",
        summary: "Disconnect from Wi-Fi",
        description: "Deactivates Wi-Fi connection and removes it from known connections",
        tags: ["Networking"]
      },

      // Robot Control
      {
        method: "POST",
        path: "/identify",
        summary: "Blink the lights",
        description: "Blink the gantry lights so you can pick the robot out of a crowd",
        tags: ["Control"],
        parameters: [
          {
            name: "seconds",
            in: "query",
            required: true,
            description: "Time to blink lights for",
            schema: { type: "integer" }
          }
        ]
      },
      {
        method: "POST",
        path: "/robot/home",
        summary: "Home the robot",
        description: "Home robot axes or specific pipette",
        tags: ["Control"],
        requestBody: {
          required: true,
          properties: {
            target: {
              type: "string",
              enum: ["pipette", "robot"],
              description: "What to home. Robot = all axes; pipette = that pipette's carriage and axes"
            },
            mount: { type: "string", description: "Which mount to home if target is pipette" }
          }
        }
      },
      {
        method: "POST",
        path: "/robot/move",
        summary: "Move the robot",
        description: "Move robot's gantry to a position. DEPRECATED: Use moveToCoordinates command in maintenance run instead",
        tags: ["Control"],
        deprecated: true,
        requestBody: {
          required: true,
          properties: {
            target: { type: "string", enum: ["pipette", "mount"] },
            point: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            mount: { type: "string", enum: ["right", "left"] },
            model: { type: "string", description: "Pipette model if target is pipette" }
          }
        }
      },
      {
        method: "GET",
        path: "/robot/positions",
        summary: "Get robot positions",
        description: "Get list of useful positions. DEPRECATED: OT-2 only, no public equivalent for Flex",
        tags: ["Control"],
        deprecated: true
      },
      {
        method: "GET",
        path: "/robot/lights",
        summary: "Get light state",
        description: "Get current status of robot's rail lights",
        tags: ["Control"]
      },
      {
        method: "POST",
        path: "/robot/lights",
        summary: "Control lights",
        description: "Turn rail lights on or off",
        tags: ["Control"],
        requestBody: {
          required: true,
          properties: {
            on: { type: "boolean", description: "True to turn lights on, false to turn off" }
          }
        }
      },

      // Settings & Configuration
      {
        method: "GET",
        path: "/settings",
        summary: "Get settings",
        description: "Get list of available advanced settings (feature flags) and their values",
        tags: ["Settings"]
      },
      {
        method: "POST",
        path: "/settings",
        summary: "Change a setting",
        description: "Change an advanced setting (feature flag)",
        tags: ["Settings"],
        requestBody: {
          required: true,
          properties: {
            id: { type: "string", description: "ID of setting to change" },
            value: { type: "boolean", description: "New value. If null, reset to default" }
          }
        }
      },
      {
        method: "POST",
        path: "/settings/log_level/local",
        summary: "Set local log level",
        description: "Set minimum level of logs saved locally",
        tags: ["Settings"],
        requestBody: {
          required: true,
          properties: {
            log_level: {
              type: "string",
              enum: ["debug", "info", "warning", "error"],
              description: "Log level conforming to Python log levels"
            }
          }
        }
      },
      {
        method: "GET",
        path: "/settings/reset/options",
        summary: "Get reset options",
        description: "Get robot settings and data that can be reset through POST /settings/reset",
        tags: ["Settings"]
      },
      {
        method: "POST",
        path: "/settings/reset",
        summary: "Reset settings or data",
        description: "Perform reset of requested robot settings or data. Always restart robot after using this endpoint",
        tags: ["Settings"]
      },

      // Pipettes & Instruments
      {
        method: "GET",
        path: "/pipettes",
        summary: "Get attached pipettes",
        description: "Lists properties of pipettes currently attached to robot like name, model, and mount. For Flex, prefer GET /instruments",
        tags: ["Attached Instruments"],
        parameters: [
          {
            name: "refresh",
            in: "query",
            description: "If true, actively scan for attached pipettes. WARNING: disables pipette motors, OT-2 only",
            schema: { type: "boolean", default: false }
          }
        ]
      },
      {
        method: "GET",
        path: "/instruments",
        summary: "Get attached instruments",
        description: "Get information about currently attached instruments (pipettes). Preferred endpoint for Flex robots",
        tags: ["Attached Instruments"]
      },
      {
        method: "GET",
        path: "/settings/pipettes",
        summary: "Get pipette settings",
        description: "List all settings for all known pipettes by ID. OT-2 only",
        tags: ["Settings"]
      },
      {
        method: "GET",
        path: "/settings/pipettes/{pipette_id}",
        summary: "Get specific pipette settings",
        description: "Get settings of specific pipette by ID. OT-2 only",
        tags: ["Settings"],
        parameters: [
          {
            name: "pipette_id",
            in: "path",
            required: true,
            description: "Pipette ID"
          }
        ]
      },
      {
        method: "PATCH",
        path: "/settings/pipettes/{pipette_id}",
        summary: "Update pipette settings",
        description: "Change settings of specific pipette. OT-2 only",
        tags: ["Settings"],
        parameters: [
          {
            name: "pipette_id",
            in: "path",
            required: true,
            description: "Pipette ID"
          }
        ]
      },

      // Modules
      {
        method: "GET",
        path: "/modules",
        summary: "Get attached modules",
        description: "Get list of all modules currently attached to the robot",
        tags: ["Attached Modules"]
      },
      {
        method: "POST",
        path: "/modules/{serial}",
        summary: "Execute module command",
        description: "Command a module to take an action. DEPRECATED: Use POST /commands instead",
        tags: ["Attached Modules"],
        deprecated: true,
        parameters: [
          {
            name: "serial",
            in: "path",
            required: true,
            description: "Serial number of module"
          }
        ],
        requestBody: {
          required: true,
          properties: {
            command_type: { type: "string", description: "Name of module function to call" },
            args: { type: "array", description: "Ordered args list for the call" }
          }
        }
      },
      {
        method: "POST",
        path: "/modules/{serial}/update",
        summary: "Update module firmware",
        description: "Command robot to flash bundled firmware file for this module type",
        tags: ["Attached Modules"],
        parameters: [
          {
            name: "serial",
            in: "path",
            required: true,
            description: "Serial number of module"
          }
        ]
      },

      // Protocol Management
      {
        method: "GET",
        path: "/protocols",
        summary: "Get protocols",
        description: "Get list of all protocols stored on the robot",
        tags: ["Protocol Management"]
      },
      {
        method: "POST",
        path: "/protocols",
        summary: "Upload protocol",
        description: "Upload a Python or JSON protocol file to the robot. Can include support files",
        tags: ["Protocol Management"],
        requestBody: {
          required: true,
          description: "Multipart form data with protocol file and optional support files"
        }
      },
      {
        method: "GET",
        path: "/protocols/{protocol_id}",
        summary: "Get protocol details",
        description: "Get detailed information about a specific protocol",
        tags: ["Protocol Management"],
        parameters: [
          {
            name: "protocol_id",
            in: "path",
            required: true,
            description: "Protocol ID"
          }
        ]
      },
      {
        method: "DELETE",
        path: "/protocols/{protocol_id}",
        summary: "Delete protocol",
        description: "Delete a protocol from the robot",
        tags: ["Protocol Management"],
        parameters: [
          {
            name: "protocol_id",
            in: "path",
            required: true,
            description: "Protocol ID to delete"
          }
        ]
      },
      {
        method: "GET",
        path: "/protocols/{protocol_id}/analyses",
        summary: "Get protocol analyses",
        description: "Get list of analyses for a protocol",
        tags: ["Protocol Management"],
        parameters: [
          {
            name: "protocol_id",
            in: "path",
            required: true,
            description: "Protocol ID"
          }
        ]
      },
      {
        method: "GET",
        path: "/protocols/{protocol_id}/analyses/{analysis_id}",
        summary: "Get specific protocol analysis",
        description: "Get detailed analysis results for a protocol including commands, errors, and metadata",
        tags: ["Protocol Management"],
        parameters: [
          {
            name: "protocol_id",
            in: "path",
            required: true,
            description: "Protocol ID"
          },
          {
            name: "analysis_id",
            in: "path",
            required: true,
            description: "Analysis ID"
          }
        ]
      },

      // Run Management
      {
        method: "GET",
        path: "/runs",
        summary: "Get runs",
        description: "Get list of all protocol runs",
        tags: ["Run Management"]
      },
      {
        method: "POST",
        path: "/runs",
        summary: "Create run",
        description: "Create a new protocol run",
        tags: ["Run Management"],
        requestBody: {
          required: true,
          properties: {
            data: {
              type: "object",
              properties: {
                protocolId: { type: "string", description: "ID of protocol to run" },
                labwareOffsets: { type: "array", description: "Labware offset data" },
                runTimeParameterValues: { type: "object", description: "Runtime parameter values" }
              }
            }
          }
        }
      },
      {
        method: "GET",
        path: "/runs/{run_id}",
        summary: "Get run details",
        description: "Get detailed information about a specific run",
        tags: ["Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Run ID"
          }
        ]
      },
      {
        method: "DELETE",
        path: "/runs/{run_id}",
        summary: "Delete run",
        description: "Delete a protocol run",
        tags: ["Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Run ID to delete"
          }
        ]
      },
      {
        method: "GET",
        path: "/runs/{run_id}/commands",
        summary: "Get run commands",
        description: "Get list of commands executed in a run",
        tags: ["Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Run ID"
          },
          {
            name: "cursor",
            in: "query",
            description: "Cursor for pagination"
          },
          {
            name: "pageLength",
            in: "query",
            description: "Number of commands to return",
            schema: { type: "integer" }
          }
        ]
      },
      {
        method: "POST",
        path: "/runs/{run_id}/commands",
        summary: "Execute run command",
        description: "Queue a command for execution in a run",
        tags: ["Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Run ID"
          }
        ],
        requestBody: {
          required: true,
          description: "Command to execute"
        }
      },
      {
        method: "POST",
        path: "/runs/{run_id}/actions",
        summary: "Control run execution",
        description: "Play, pause, stop, or resume a protocol run",
        tags: ["Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Run ID"
          }
        ],
        requestBody: {
          required: true,
          properties: {
            data: {
              type: "object",
              properties: {
                actionType: {
                  type: "string",
                  enum: ["play", "pause", "stop", "resume-from-recovery"],
                  description: "Action to perform on the run"
                }
              }
            }
          }
        }
      },

      // Maintenance Runs
      {
        method: "GET",
        path: "/maintenance_runs",
        summary: "Get maintenance runs",
        description: "Get list of maintenance runs for robot calibration and setup",
        tags: ["Maintenance Run Management"]
      },
      {
        method: "POST",
        path: "/maintenance_runs",
        summary: "Create maintenance run",
        description: "Create a new maintenance run for calibration or diagnostics",
        tags: ["Maintenance Run Management"],
        requestBody: {
          required: true,
          properties: {
            data: {
              type: "object",
              properties: {
                runType: {
                  type: "string",
                  enum: ["deck_calibration", "pipette_offset_calibration", "tip_length_calibration"],
                  description: "Type of maintenance run"
                }
              }
            }
          }
        }
      },
      {
        method: "GET",
        path: "/maintenance_runs/{run_id}",
        summary: "Get maintenance run details",
        description: "Get detailed information about a maintenance run",
        tags: ["Maintenance Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Maintenance run ID"
          }
        ]
      },
      {
        method: "POST",
        path: "/maintenance_runs/{run_id}/commands",
        summary: "Execute maintenance command",
        description: "Execute a command in a maintenance run",
        tags: ["Maintenance Run Management"],
        parameters: [
          {
            name: "run_id",
            in: "path",
            required: true,
            description: "Maintenance run ID"
          }
        ]
      },

      // Simple Commands
      {
        method: "POST",
        path: "/commands",
        summary: "Execute simple command",
        description: "Execute a simple robot command outside of a run context",
        tags: ["Simple Commands"],
        requestBody: {
          required: true,
          description: "Command to execute"
        }
      },

      // Data Files
      {
        method: "GET",
        path: "/dataFiles",
        summary: "Get data files",
        description: "Get list of CSV data files stored on robot",
        tags: ["Data files Management"]
      },
      {
        method: "POST",
        path: "/dataFiles",
        summary: "Upload data file",
        description: "Upload a CSV data file to the robot",
        tags: ["Data files Management"],
        requestBody: {
          required: true,
          description: "Multipart form data with CSV file"
        }
      },
      {
        method: "GET",
        path: "/dataFiles/{file_id}",
        summary: "Get data file details",
        description: "Get information about a specific data file",
        tags: ["Data files Management"],
        parameters: [
          {
            name: "file_id",
            in: "path",
            required: true,
            description: "Data file ID"
          }
        ]
      },
      {
        method: "DELETE",
        path: "/dataFiles/{file_id}",
        summary: "Delete data file",
        description: "Delete a data file from the robot",
        tags: ["Data files Management"],
        parameters: [
          {
            name: "file_id",
            in: "path",
            required: true,
            description: "Data file ID to delete"
          }
        ]
      },

      // Calibration
      {
        method: "GET",
        path: "/calibration/status",
        summary: "Get calibration status",
        description: "Get current calibration status for deck and instruments",
        tags: ["Deck Calibration"]
      },
      {
        method: "GET",
        path: "/labwareOffsets",
        summary: "Get labware offsets",
        description: "Get list of stored labware offset calibrations",
        tags: ["Labware Offset Management"]
      },
      {
        method: "POST",
        path: "/labwareOffsets",
        summary: "Create labware offset",
        description: "Add new labware offset calibration data",
        tags: ["Labware Offset Management"]
      },

      // System Control
      {
        method: "GET",
        path: "/system/time",
        summary: "Get system time",
        description: "Get current system time",
        tags: ["System Control"]
      },
      {
        method: "PUT",
        path: "/system/time",
        summary: "Set system time",
        description: "Update system time",
        tags: ["System Control"]
      },
      {
        method: "POST",
        path: "/system/restart",
        summary: "Restart robot",
        description: "Restart the robot system",
        tags: ["System Control"]
      },

      // Motor Control
      {
        method: "GET",
        path: "/motors/engaged",
        summary: "Get engaged motors",
        description: "Query which motors are engaged and holding position",
        tags: ["Control"]
      },
      {
        method: "POST",
        path: "/motors/disengage",
        summary: "Disengage motors",
        description: "Disengage specified motors",
        tags: ["Control"],
        requestBody: {
          required: true,
          properties: {
            axes: {
              type: "array",
              items: {
                type: "string",
                enum: ["x", "y", "z_l", "z_r", "z_g", "p_l", "p_r", "q", "g", "z", "a", "b", "c"]
              },
              description: "List of axes to disengage"
            }
          }
        }
      },

      // Camera (OT-2 only)
      {
        method: "POST",
        path: "/camera/picture",
        summary: "Capture camera image",
        description: "Capture image from OT-2's on-board camera. OT-2 only",
        tags: ["Control"]
      },

      // Deck Configuration (Flex)
      {
        method: "GET",
        path: "/deck_configuration",
        summary: "Get deck configuration",
        description: "Get current deck configuration including slot status. Flex only",
        tags: ["Flex Deck Configuration"]
      },
      {
        method: "PUT",
        path: "/deck_configuration",
        summary: "Update deck configuration",
        description: "Update deck configuration. Flex only",
        tags: ["Flex Deck Configuration"]
      },

      // Error Recovery
      {
        method: "GET",
        path: "/errorRecovery/settings",
        summary: "Get error recovery settings",
        description: "Get current error recovery policy settings",
        tags: ["Error Recovery Settings"]
      },
      {
        method: "PATCH",
        path: "/errorRecovery/settings",
        summary: "Update error recovery settings",
        description: "Update error recovery policy settings",
        tags: ["Error Recovery Settings"]
      },

      // Client Data
      {
        method: "GET",
        path: "/clientData",
        summary: "Get client data",
        description: "Get all client-defined key-value data stored on robot",
        tags: ["Client Data"]
      },
      {
        method: "POST",
        path: "/clientData",
        summary: "Create client data",
        description: "Store new client-defined key-value data",
        tags: ["Client Data"]
      },
      {
        method: "GET",
        path: "/clientData/{key}",
        summary: "Get specific client data",
        description: "Get client data for a specific key",
        tags: ["Client Data"],
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            description: "Client data key"
          }
        ]
      },
      {
        method: "PUT",
        path: "/clientData/{key}",
        summary: "Update client data",
        description: "Update client data for a specific key",
        tags: ["Client Data"],
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            description: "Client data key"
          }
        ]
      },
      {
        method: "DELETE",
        path: "/clientData/{key}",
        summary: "Delete client data",
        description: "Delete client data for a specific key",
        tags: ["Client Data"],
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            description: "Client data key"
          }
        ]
      }
    ];
  }

  searchEndpoints(args) {
    const { query, method, tag, include_deprecated = false } = args;

    let filtered = this.endpoints.filter(endpoint => {
      // Filter deprecated endpoints
      if (!include_deprecated && endpoint.deprecated) return false;

      // Filter by method
      if (method && endpoint.method !== method.toUpperCase()) return false;

      // Filter by tag
      if (tag && !endpoint.tags.some(t =>
        t.toLowerCase().includes(tag.toLowerCase())
      )) return false;

      // Search in multiple fields
      const searchText = query.toLowerCase();
      return (
        endpoint.summary.toLowerCase().includes(searchText) ||
        endpoint.description.toLowerCase().includes(searchText) ||
        endpoint.path.toLowerCase().includes(searchText) ||
        endpoint.tags.some(t => t.toLowerCase().includes(searchText)) ||
        (endpoint.operationId && endpoint.operationId.toLowerCase().includes(searchText))
      );
    });

    // Sort by relevance (exact matches first, then partial)
    filtered.sort((a, b) => {
      const queryLower = query.toLowerCase();
      const aExact = a.summary.toLowerCase().includes(queryLower) || a.path.toLowerCase().includes(queryLower);
      const bExact = b.summary.toLowerCase().includes(queryLower) || b.path.toLowerCase().includes(queryLower);

      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      return 0;
    });

    const results = filtered.slice(0, 20).map(endpoint => ({
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      tags: endpoint.tags,
      deprecated: endpoint.deprecated || false
    }));

    return {
      content: [
        {
          type: "text",
          text: `Found ${filtered.length} matching endpoints${filtered.length > 20 ? ' (showing first 20)' : ''}:\n\n` +
            results.map(r =>
              `**${r.method} ${r.path}** ${r.deprecated ? '⚠️ DEPRECATED' : ''}\n` +
              `${r.summary}\n` +
              `Tags: ${r.tags.join(', ')}\n`
            ).join('\n')
        }
      ]
    };
  }

  getEndpointDetails(args) {
    const { method, path } = args;

    const endpoint = this.endpoints.find(
      e => e.method === method.toUpperCase() && e.path === path
    );

    if (!endpoint) {
      return {
        content: [
          {
            type: "text",
            text: `Endpoint ${method.toUpperCase()} ${path} not found.`
          }
        ]
      };
    }

    let details = `# ${endpoint.method} ${endpoint.path}\n\n`;
    details += `**Summary:** ${endpoint.summary}\n\n`;
    details += `**Description:** ${endpoint.description}\n\n`;
    details += `**Tags:** ${endpoint.tags.join(', ')}\n\n`;

    if (endpoint.deprecated) {
      details += `⚠️ **DEPRECATED** - This endpoint is deprecated and may be removed in future versions\n\n`;
    }

    if (endpoint.parameters && endpoint.parameters.length > 0) {
      details += `## Parameters\n\n`;
      endpoint.parameters.forEach(param => {
        details += `- **${param.name}** (${param.in})${param.required ? ' *required*' : ''}: ${param.description}\n`;
        if (param.schema && param.schema.enum) {
          details += `  - Allowed values: ${param.schema.enum.join(', ')}\n`;
        }
        if (param.schema && param.schema.default !== undefined) {
          details += `  - Default: ${param.schema.default}\n`;
        }
      });
      details += '\n';
    }

    if (endpoint.requestBody) {
      details += `## Request Body\n\n`;
      if (endpoint.requestBody.required) {
        details += `*Required*\n\n`;
      }
      details += `${endpoint.requestBody.description || 'Request body data'}\n\n`;

      if (endpoint.requestBody.properties) {
        details += `### Properties:\n`;
        Object.entries(endpoint.requestBody.properties).forEach(([key, prop]) => {
          details += `- **${key}** (${prop.type || 'object'}): ${prop.description || 'No description'}\n`;
          if (prop.enum) {
            details += `  - Allowed values: ${prop.enum.join(', ')}\n`;
          }
          if (prop.default !== undefined) {
            details += `  - Default: ${prop.default}\n`;
          }
        });
      }
      details += '\n';
    }

    if (endpoint.responses) {
      details += `## Responses\n\n`;
      Object.entries(endpoint.responses).forEach(([code, description]) => {
        details += `- **${code}**: ${description}\n`;
      });
      details += '\n';
    }

    // Add usage context and related endpoints
    details += `## Usage Context\n\n`;
    if (endpoint.tags.includes('Health')) {
      details += `This endpoint is used for monitoring robot health and status. The /health endpoint is commonly used to verify robot connectivity.\n\n`;
    } else if (endpoint.tags.includes('Networking')) {
      details += `This endpoint manages robot network connectivity. Useful for configuring Wi-Fi, checking network status, and managing network credentials.\n\n`;
    } else if (endpoint.tags.includes('Run Management')) {
      details += `This endpoint is part of the protocol execution workflow. Use to create, monitor, and control protocol runs.\n\n`;
    } else if (endpoint.tags.includes('Protocol Management')) {
      details += `This endpoint manages protocol files on the robot. Use to upload, analyze, and manage protocol definitions.\n\n`;
    } else if (endpoint.tags.includes('Control')) {
      details += `This endpoint provides direct robot hardware control. Use for movement, homing, lighting, and other physical operations.\n\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: details
        }
      ]
    };
  }

  listByCategory(args) {
    const { category } = args;

    const filtered = this.endpoints.filter(endpoint =>
      endpoint.tags.some(tag => tag.toLowerCase().includes(category.toLowerCase()))
    );

    if (filtered.length === 0) {
      const availableCategories = [...new Set(this.endpoints.flatMap(e => e.tags))];
      return {
        content: [
          {
            type: "text",
            text: `No endpoints found for category "${category}".\n\nAvailable categories:\n${availableCategories.map(cat => `- ${cat}`).join('\n')}`
          }
        ]
      };
    }

    // Group by exact tag match
    const groupedByTag = {};
    filtered.forEach(endpoint => {
      endpoint.tags.forEach(tag => {
        if (tag.toLowerCase().includes(category.toLowerCase())) {
          if (!groupedByTag[tag]) groupedByTag[tag] = [];
          groupedByTag[tag].push(endpoint);
        }
      });
    });

    let content = `**${category} API Endpoints** (${filtered.length} found):\n\n`;

    Object.entries(groupedByTag).forEach(([tag, endpoints]) => {
      content += `## ${tag}\n\n`;
      endpoints.forEach(endpoint => {
        content += `• **${endpoint.method} ${endpoint.path}** ${endpoint.deprecated ? '⚠️ DEPRECATED' : ''}\n`;
        content += `  ${endpoint.summary}\n\n`;
      });
    });

    return {
      content: [
        {
          type: "text",
          text: content
        }
      ]
    };
  }

  getApiOverview() {
    const categories = [...new Set(this.endpoints.flatMap(e => e.tags))];
    const totalEndpoints = this.endpoints.length;
    const deprecatedCount = this.endpoints.filter(e => e.deprecated).length;
    const methodCounts = this.endpoints.reduce((acc, e) => {
      acc[e.method] = (acc[e.method] || 0) + 1;
      return acc;
    }, {});

    let overview = `# Opentrons HTTP API Overview\n\n`;
    overview += `The Opentrons HTTP API provides comprehensive control over Opentrons Flex and OT-2 robots. This RESTful API runs on port 31950 and enables protocol execution, hardware control, calibration, and system management.\n\n`;

    overview += `## API Statistics\n\n`;
    overview += `- **Total Endpoints**: ${totalEndpoints}\n`;
    overview += `- **Deprecated Endpoints**: ${deprecatedCount}\n`;
    overview += `- **HTTP Methods**: ${Object.entries(methodCounts).map(([method, count]) => `${method} (${count})`).join(', ')}\n\n`;

    overview += `## API Categories\n\n`;

    const categoryDescriptions = {
      'Health': 'Monitor robot status, get logs, check server health',
      'Networking': 'Configure Wi-Fi, manage network settings, connectivity status',
      'Control': 'Direct hardware control - movement, homing, lights, motors',
      'Settings': 'Robot configuration, feature flags, calibration settings',
      'Run Management': 'Execute protocols, control run state (play/pause/stop)',
      'Protocol Management': 'Upload, analyze, and manage protocol files',
      'Maintenance Run Management': 'Calibration workflows and diagnostics',
      'Attached Modules': 'Control temperature modules, magnetic modules, etc.',
      'Attached Instruments': 'Pipette information and configuration',
      'Data files Management': 'CSV data files for runtime parameters',
      'Simple Commands': 'Execute individual robot commands',
      'Labware Offset Management': 'Calibration data for labware positioning',
      'System Control': 'System time, restart, low-level system operations',
      'Client Data': 'Store arbitrary key-value data on robot',
      'Flex Deck Configuration': 'Flex-specific deck setup and configuration',
      'Error Recovery Settings': 'Configure error handling policies'
    };

    categories.forEach(category => {
      const count = this.endpoints.filter(e => e.tags.includes(category)).length;
      const description = categoryDescriptions[category] || 'Robot functionality';
      overview += `- **${category}** (${count} endpoints): ${description}\n`;
    });

    overview += `\n## Getting Started\n\n`;
    overview += `1. **Check Robot Health**: Start with \`GET /health\` to verify connectivity\n`;
    overview += `2. **Network Setup**: Use \`/networking/status\` and \`/wifi/*\` endpoints for network configuration\n`;
    overview += `3. **Upload Protocol**: Use \`POST /protocols\` to upload protocol files\n`;
    overview += `4. **Create Run**: Use \`POST /runs\` to create a protocol run\n`;
    overview += `5. **Execute**: Use \`POST /runs/{id}/actions\` to play/pause/stop runs\n`;
    overview += `6. **Monitor**: Use \`GET /runs/{id}\` and \`GET /runs/{id}/commands\` to monitor progress\n\n`;

    overview += `## Important Notes\n\n`;
    overview += `- **API Versioning**: All requests must include \`Opentrons-Version\` header (use "*" for latest)\n`;
    overview += `- **Port**: API runs on port 31950\n`;
    overview += `- **OpenAPI Spec**: Available at \`/openapi\` endpoint\n`;
    overview += `- **Documentation**: Interactive docs at \`/redoc\`\n`;
    overview += `- **Robot Differences**: Some endpoints are OT-2 or Flex specific\n`;
    overview += `- **Deprecated Endpoints**: ${deprecatedCount} endpoints are deprecated - use modern alternatives\n\n`;

    overview += `## Common Workflows\n\n`;
    overview += `### Protocol Execution\n`;
    overview += `1. Upload protocol: \`POST /protocols\`\n`;
    overview += `2. Create run: \`POST /runs\`\n`;
    overview += `3. Start execution: \`POST /runs/{id}/actions\` with "play"\n`;
    overview += `4. Monitor progress: \`GET /runs/{id}/commands\`\n\n`;

    overview += `### Robot Calibration\n`;
    overview += `1. Create maintenance run: \`POST /maintenance_runs\`\n`;
    overview += `2. Execute calibration commands: \`POST /maintenance_runs/{id}/commands\`\n`;
    overview += `3. Check calibration status: \`GET /calibration/status\`\n\n`;

    overview += `### Hardware Control\n`;
    overview += `1. Home robot: \`POST /robot/home\`\n`;
    overview += `2. Check attached instruments: \`GET /instruments\`\n`;
    overview += `3. Control lights: \`POST /robot/lights\`\n`;
    overview += `4. Execute simple commands: \`POST /commands\`\n\n`;

    return {
      content: [
        {
          type: "text",
          text: overview
        }
      ]
    };
  }

  // Helper method for making API requests
  async makeApiRequest(method, url, headers = {}, body = null) {
    try {
      const options = {
        method,
        headers: {
          'Opentrons-Version': '*',
          ...headers
        }
      };
      
      if (body) {
        options.body = body;
      }
      
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${data.message || JSON.stringify(data)}`);
      }
      
      return data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to robot. Please check the IP address and ensure the robot is powered on.`);
      }
      throw error;
    }
  }

  // Automation tool methods
  async uploadProtocol(args) {
    const { robot_ip, file_path, support_files = [], protocol_kind = "standard" } = args;
    
    try {
      // Import required modules
      const fs = await import('fs');
      const path = await import('path');
      
      // Check if main protocol file exists and is readable
      if (!fs.existsSync(file_path)) {
        return {
          content: [{
            type: "text",
            text: `❌ **File not found**: ${file_path}\n\nPlease check:\n- File path is correct\n- File exists\n- You have read permissions`
          }]
        };
      }

      // Check file permissions
      try {
        fs.accessSync(file_path, fs.constants.R_OK);
      } catch (err) {
        return {
          content: [{
            type: "text", 
            text: `❌ **Permission denied**: Cannot read ${file_path}\n\nTry:\n- \`chmod 644 "${file_path}"\`\n- Moving file to a readable location\n- Running with proper permissions`
          }]
        };
      }

      // Validate file extension
      const ext = path.extname(file_path).toLowerCase();
      if (!['.py', '.json'].includes(ext)) {
        return {
          content: [{
            type: "text",
            text: `❌ **Invalid file type**: ${ext}\n\nOpentrons protocols must be:\n- Python files (.py)\n- JSON protocol files (.json)`
          }]
        };
      }

      // For now, let's use curl instead of trying to fight FormData
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Build curl command
      let curlCmd = `curl -X POST "http://${robot_ip}:31950/protocols"`;
      curlCmd += ` -H "Opentrons-Version: *"`;
      curlCmd += ` -H "accept: application/json"`;
      curlCmd += ` -F "files=@${file_path}"`;
      
      // Add support files
      for (const supportPath of support_files) {
        if (fs.existsSync(supportPath)) {
          curlCmd += ` -F "supportFiles=@${supportPath}"`;
        }
      }
      
      // Add protocol kind if not standard
      if (protocol_kind !== "standard") {
        curlCmd += ` -F "protocolKind=${protocol_kind}"`;
      }

      console.error(`Executing: ${curlCmd}`);
      
      const { stdout, stderr } = await execAsync(curlCmd);
      
      if (stderr && !stderr.includes('% Total')) {
        throw new Error(`Curl error: ${stderr}`);
      }

      let responseData;
      try {
        responseData = JSON.parse(stdout);
      } catch (parseErr) {
        return {
          content: [{
            type: "text",
            text: `❌ **Upload failed** - Invalid response from robot\n\n**Response**: ${stdout.slice(0, 500)}${stdout.length > 500 ? '...' : ''}\n\n**Possible issues**:\n- Robot not reachable at ${robot_ip}:31950\n- Robot server not running\n- Network connectivity problems`
          }]
        };
      }

      // Check for errors in response
      if (responseData.errors || (responseData.data && responseData.data.errors)) {
        const errors = responseData.errors || responseData.data.errors || [];
        let errorDetails = `❌ **Upload failed**\n\n`;
        
        if (errors.length > 0) {
          errorDetails += `**Protocol Errors**:\n${errors.map(err => `- ${err.detail || err.message || err}`).join('\n')}\n`;
        } else {
          errorDetails += `**Error**: ${responseData.message || 'Unknown error'}\n`;
        }
        
        errorDetails += `\n**Troubleshooting**:\n`;
        errorDetails += `- Check robot is connected: \`curl http://${robot_ip}:31950/health\`\n`;
        errorDetails += `- Verify protocol file syntax\n`;
        errorDetails += `- Try uploading via Opentrons App first\n`;
        
        return {
          content: [{
            type: "text",
            text: errorDetails
          }]
        };
      }

      // Success response
      const protocolId = responseData?.data?.id;
      const protocolName = responseData?.data?.metadata?.protocolName || path.basename(file_path);
      const apiVersion = responseData?.data?.metadata?.apiLevel || 'Unknown';
      
      let successMsg = `✅ **Protocol uploaded successfully!**\n\n`;
      successMsg += `**Protocol ID**: \`${protocolId}\`\n`;
      successMsg += `**Name**: ${protocolName}\n`;
      successMsg += `**API Version**: ${apiVersion}\n`;
      successMsg += `**File**: ${path.basename(file_path)}\n`;
      
      if (support_files.length > 0) {
        successMsg += `**Support Files**: ${support_files.length} files\n`;
      }
      
      successMsg += `\n**Next Steps**:\n`;
      successMsg += `1. Create a run: \`POST /runs\` with \`{"data": {"protocolId": "${protocolId}"}}\`\n`;
      successMsg += `2. Start run: \`POST /runs/{run_id}/actions\` with \`{"data": {"actionType": "play"}}\`\n`;
      
      // Check for analysis warnings
      if (responseData?.data?.analyses?.length > 0) {
        const analysis = responseData.data.analyses[0];
        if (analysis.status === 'completed' && analysis.result === 'ok') {
          successMsg += `\n✅ **Protocol analysis passed** - Ready to run\n`;
        } else if (analysis.status === 'completed' && analysis.result === 'error') {
          successMsg += `\n⚠️ **Protocol analysis found issues** - Check protocol before running\n`;
        }
      }
      
      return {
        content: [{
          type: "text",
          text: successMsg
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Upload error**: ${error.message}\n\n**Possible causes**:\n- Robot not reachable at ${robot_ip}:31950\n- Network connectivity issues\n- File permissions\n- curl not installed\n\n**Debug info**: ${error.stack?.split('\n')[0] || 'No stack trace'}`
        }]
      };
    }
  }

  async getProtocols(args) {
    const { robot_ip, protocol_kind } = args;
    
    try {
      const data = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/protocols`
      );
      
      let protocols = data.data || [];
      
      // Filter by kind if specified
      if (protocol_kind) {
        protocols = protocols.filter(p => p.protocolKind === protocol_kind);
      }
      
      if (protocols.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No protocols found on robot${protocol_kind ? ` of type '${protocol_kind}'` : ''}.`
            }
          ]
        };
      }
      
      const protocolList = protocols.map(p => {
        const analysis = p.analysisSummaries?.[0];
        return `**${p.metadata?.protocolName || p.files[0]?.name || 'Unnamed Protocol'}**\n` +
               `  ID: ${p.id}\n` +
               `  Type: ${p.protocolKind || 'standard'}\n` +
               `  Created: ${new Date(p.createdAt).toLocaleString()}\n` +
               `  Analysis: ${analysis?.status || 'No analysis'}\n` +
               `  Author: ${p.metadata?.author || 'Unknown'}\n`;
      }).join('\n');
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${protocols.length} protocol${protocols.length !== 1 ? 's' : ''} on robot:\n\n${protocolList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get protocols: ${error.message}`
          }
        ]
      };
    }
  }

  async createRun(args) {
    const { robot_ip, protocol_id, run_time_parameters } = args;
    
    try {
      const body = {
        data: {
          protocolId: protocol_id
        }
      };
      
      if (run_time_parameters) {
        body.data.runTimeParameterValues = run_time_parameters;
      }
      
      const data = await this.makeApiRequest(
        'POST',
        `http://${robot_ip}:31950/runs`,
        { 'Content-Type': 'application/json' },
        JSON.stringify(body)
      );
      
      const run = data.data;
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Run created successfully!\n\n` +
                  `**Run ID:** ${run.id}\n` +
                  `**Status:** ${run.status}\n` +
                  `**Protocol ID:** ${run.protocolId}\n` +
                  `**Created:** ${new Date(run.createdAt).toLocaleString()}\n\n` +
                  `Use the run ID to control execution (play/pause/stop).`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to create run: ${error.message}`
          }
        ]
      };
    }
  }

  async controlRun(args) {
    const { robot_ip, run_id, action } = args;
    
    try {
      const body = {
        data: {
          actionType: action
        }
      };
      
      const data = await this.makeApiRequest(
        'POST',
        `http://${robot_ip}:31950/runs/${run_id}/actions`,
        { 'Content-Type': 'application/json' },
        JSON.stringify(body)
      );
      
      const actionData = data.data;
      
      // Get updated run status
      const runData = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/runs/${run_id}`
      );
      
      const run = runData.data;
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Run action '${action}' executed successfully!\n\n` +
                  `**Action ID:** ${actionData.id}\n` +
                  `**Run Status:** ${run.status}\n` +
                  `**Current Action:** ${run.actions?.[run.actions.length - 1]?.actionType || 'None'}\n` +
                  `**Completed At:** ${run.completedAt ? new Date(run.completedAt).toLocaleString() : 'Not completed'}\n`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to control run: ${error.message}`
          }
        ]
      };
    }
  }

  async getRuns(args) {
    const { robot_ip } = args;
    
    try {
      const data = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/runs`
      );
      
      const runs = data.data || [];
      
      if (runs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No runs found on robot.`
            }
          ]
        };
      }
      
      const runList = runs.slice(0, 10).map(r => {
        const duration = r.completedAt && r.startedAt
          ? Math.round((new Date(r.completedAt) - new Date(r.startedAt)) / 1000 / 60)
          : null;
          
        return `**Run ${r.id}**\n` +
               `  Status: ${r.status}\n` +
               `  Created: ${new Date(r.createdAt).toLocaleString()}\n` +
               `  Protocol: ${r.protocolId || 'None'}\n` +
               `  Duration: ${duration ? `${duration} minutes` : 'N/A'}\n`;
      }).join('\n');
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${runs.length} run${runs.length !== 1 ? 's' : ''} on robot${runs.length > 10 ? ' (showing latest 10)' : ''}:\n\n${runList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get runs: ${error.message}`
          }
        ]
      };
    }
  }

  async getRunStatus(args) {
    const { robot_ip, run_id } = args;
    
    try {
      const data = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/runs/${run_id}`
      );
      
      const run = data.data;
      
      // Get recent commands
      const commandsData = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/runs/${run_id}/commands?pageLength=5`
      );
      
      const commands = commandsData.data || [];
      const totalCommands = commandsData.meta?.totalLength || 0;
      const completedCommands = commands.filter(c => c.status === 'succeeded').length;
      
      let statusText = `**Run Status: ${run.status}**\n\n`;
      statusText += `**Run ID:** ${run.id}\n`;
      statusText += `**Created:** ${new Date(run.createdAt).toLocaleString()}\n`;
      statusText += `**Started:** ${run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Not started'}\n`;
      statusText += `**Completed:** ${run.completedAt ? new Date(run.completedAt).toLocaleString() : 'Not completed'}\n`;
      statusText += `**Protocol:** ${run.protocolId || 'None'}\n`;
      statusText += `**Commands:** ${completedCommands}/${totalCommands} completed\n\n`;
      
      if (run.errors && run.errors.length > 0) {
        statusText += `**Errors:**\n`;
        run.errors.forEach(err => {
          statusText += `- ${err.detail || err.title || 'Unknown error'}\n`;
        });
        statusText += '\n';
      }
      
      if (commands.length > 0) {
        statusText += `**Recent Commands:**\n`;
        commands.slice(0, 5).forEach(cmd => {
          statusText += `- ${cmd.commandType}: ${cmd.status}\n`;
        });
      }
      
      return {
        content: [
          {
            type: "text",
            text: statusText
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get run status: ${error.message}`
          }
        ]
      };
    }
  }

  async robotHealth(args) {
    const { robot_ip } = args;
    
    try {
      const data = await this.makeApiRequest(
        'GET',
        `http://${robot_ip}:31950/health`
      );
      
      const health = data;
      const links = health.links || {};
      
      let healthText = `✅ **Robot is healthy and connected!**\n\n`;
      healthText += `**Robot Name:** ${health.name || 'Unknown'}\n`;
      healthText += `**API Version:** ${health.api_version}\n`;
      healthText += `**Firmware Version:** ${health.fw_version || 'Unknown'}\n`;
      healthText += `**System Version:** ${health.system_version || 'Unknown'}\n`;
      healthText += `**Robot Model:** ${health.robot_model || 'Unknown'}\n`;
      healthText += `**Robot Serial:** ${health.robot_serial || 'Unknown'}\n\n`;
      
      healthText += `**Available Logs:**\n`;
      Object.entries(links).forEach(([key, value]) => {
        if (key.includes('Logs')) {
          healthText += `- ${key}: ${value.href}\n`;
        }
      });
      
      return {
        content: [
          {
            type: "text",
            text: healthText
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to check robot health: ${error.message}`
          }
        ]
      };
    }
  }

  async controlLights(args) {
    const { robot_ip, on } = args;
    
    try {
      const body = { on };
      
      const data = await this.makeApiRequest(
        'POST',
        `http://${robot_ip}:31950/robot/lights`,
        { 'Content-Type': 'application/json' },
        JSON.stringify(body)
      );
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Lights turned ${on ? 'ON' : 'OFF'} successfully!`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to control lights: ${error.message}`
          }
        ]
      };
    }
  }

  async homeRobot(args) {
    const { robot_ip, target = "robot", mount } = args;
    
    try {
      const body = { target };
      
      if (target === "pipette" && mount) {
        body.mount = mount;
      }
      
      const data = await this.makeApiRequest(
        'POST',
        `http://${robot_ip}:31950/robot/home`,
        { 'Content-Type': 'application/json' },
        JSON.stringify(body)
      );
      
      let message = `✅ `;
      if (target === "robot") {
        message += `Robot homed successfully! All axes are at their home positions.`;
      } else {
        message += `Pipette on ${mount} mount homed successfully!`;
      }
      
      return {
        content: [
          {
            type: "text",
            text: message
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to home robot: ${error.message}`
          }
        ]
      };
    }
  }

  async pollErrorEndpointAndFix(args) {
    const { json_filename = "error.json", original_protocol_path = "/Users/gene/Developer/failed-protocol-5.py" } = args;
    
    try {
      const axios = (await import('axios')).default;
      const baseUrl = 'http://192.168.0.145:8080';
      const jsonUrl = `${baseUrl}/${json_filename}`;
      
      console.error(`🔍 Fetching JSON error report: ${jsonUrl}`);
      
      // Fetch the specific JSON file
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${json_filename}: ${response.status} ${response.statusText}`);
      }
      
      let errorText = await response.text();
      
      // Validate and pretty-print JSON
      try {
        const parsed = JSON.parse(errorText);
        errorText = JSON.stringify(parsed, null, 2);
        console.error(`✅ Successfully fetched and parsed ${json_filename}`);
      } catch (parseError) {
        throw new Error(`Invalid JSON in ${json_filename}: ${parseError.message}`);
      }
      
      // Get current run info and stop it
      const robotIp = "192.168.0.83";
      let stopStatus = "⚠️ No running protocol found";
      let currentRunId = null;
      let lastCompletedStep = null;
      
      try {
        const runsResponse = await axios.get(`http://${robotIp}:31950/runs`);
        const activeRun = runsResponse.data.data.find(run => 
          run.status === "running" || run.status === "paused"
        );
        
        if (activeRun) {
          currentRunId = activeRun.id;
          
          // Get detailed run info including protocol name and current status
          const runDetailResponse = await axios.get(`http://${robotIp}:31950/runs/${currentRunId}`);
          const runDetail = runDetailResponse.data.data;
          
          const protocolName = runDetail.protocolId || 'Unknown Protocol';
          const currentStatus = runDetail.status;
          const currentCommand = runDetail.current ? runDetail.current.command : 'None';
          
          if (runDetail.commands) {
            const completedCommands = runDetail.commands.filter(cmd => cmd.status === "succeeded");
            const failedCommands = runDetail.commands.filter(cmd => cmd.status === "failed");
            lastCompletedStep = completedCommands.length;
            
            console.log(`Protocol: ${protocolName}, Status: ${currentStatus}, Step: ${lastCompletedStep}`);
          }
          
          // Stop the run
          await axios.post(`http://${robotIp}:31950/runs/${currentRunId}/actions`, {
            data: { actionType: "stop" }
          });
          
          stopStatus = `✅ Robot stopped
Protocol: ${protocolName}
Run ID: ${currentRunId}
Status: ${currentStatus} → stopped
Completed steps: ${lastCompletedStep || 0}
Current command: ${currentCommand}
Failed commands: ${failedCommands?.length || 0}`;
        }
      } catch (stopError) {
        stopStatus = `❌ Stop failed: ${stopError.message}`;
      }
      
      // Read original protocol and generate fix
      const originalProtocol = fs.readFileSync(original_protocol_path, 'utf8');
      const fixedProtocol = await this.generateFixedProtocol(errorText, originalProtocol, lastCompletedStep, currentRunId);
      
      return {
        content: [{
          type: "text",
          text: `🚨 **JSON ERROR REPORT**: ${json_filename}\n\n📄 **CONTENT**:\n${errorText}\n\n${stopStatus}\n\n🔧 **FIXED PROTOCOL**:\n\n\`\`\`python\n${fixedProtocol}\n\`\`\``
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to fetch error report**: ${error.message}`
        }]
      };
    }
  }

  parseDirectoryListing(html) {
    // Simple regex to extract filenames from directory listing HTML
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const files = [];
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const filename = match[1];
      // Skip parent directory links and directories
      if (filename !== '../' && !filename.endsWith('/') && filename !== '..' && filename !== '.') {
        files.push(filename);
      }
    }
    
    return files;
  }

  async generateFixedProtocol(errorText, originalProtocol, lastCompletedStep = null, currentRunId = null) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    
    const workingExample = `from opentrons import protocol_api

metadata = {
    'protocolName': 'Pierce BCA Protein Assay Kit Aliquoting',
    'author': 'OpentronsAI',
    'description': 'Automated liquid handling for protein concentration determination using Pierce BCA Protein Assay Kit',
    'source': 'OpentronsAI'
}

requirements = {
    'robotType': 'Flex',
    'apiLevel': '2.22'
}

def run(protocol: protocol_api.ProtocolContext):
    # Load trash bin
    trash = protocol.load_trash_bin('A3')
    
    # Load labware
    reservoir = protocol.load_labware('nest_12_reservoir_15ml', 'D1', 'Source Reservoir')
    pcr_plate = protocol.load_labware('nest_96_wellplate_100ul_pcr_full_skirt', 'D2', 'PCR Plate')
    tiprack = protocol.load_labware('opentrons_flex_96_filtertiprack_50ul', 'D3', 'Filter Tips 50uL')
    
    # Load pipette
    p50_multi = protocol.load_instrument('flex_8channel_50', 'left', tip_racks=[tiprack])
    
    # Define liquid
    master_mix = protocol.define_liquid(
        name='Master Mix',
        description='Pierce BCA Protein Assay Master Mix',
        display_color='#0066CC'
    )
    
    # Load liquid into reservoir
    reservoir['A1'].load_liquid(liquid=master_mix, volume=1500)
    
    # Protocol steps
    protocol.comment("Starting Pierce BCA Protein Assay Kit aliquoting protocol")
    
    # Transfer 50 µL from reservoir to first 16 wells of PCR plate
    source_well = reservoir['A1']
    destination_wells = pcr_plate.columns()[:2]  # First 2 columns = 16 wells
    
    protocol.comment("Transferring 50 µL of master mix to first 16 wells of PCR plate")
    
    p50_multi.transfer(
        volume=50,
        source=source_well,
        dest=destination_wells,
        new_tip='once'
    )
    
    protocol.comment("Protocol completed successfully")`;

    let contextInfo = "";
    if (lastCompletedStep !== null && currentRunId !== null) {
      contextInfo = `\n\nRUN CONTEXT:
- Run ID: ${currentRunId}
- Successfully completed steps: ${lastCompletedStep}
- The protocol should resume from or be modified to account for this point`;
    }

    const prompt = `Fix this Opentrons Flex protocol that failed with this error:

ERROR: ${errorText}

ORIGINAL FAILED PROTOCOL:
${originalProtocol}

WORKING REFERENCE PROTOCOL:
${workingExample}${contextInfo}

Generate a FIXED version of the original protocol that:
1. Fixes the specific error mentioned
2. Uses proper Flex deck positions (A1, B1, C1, D1, etc.)
3. Uses proper Flex pipettes and labware
4. Follows the working pattern from the reference
5. Maintains the same general purpose as the original
6. ${lastCompletedStep !== null ? `Accounts for the fact that ${lastCompletedStep} steps were already completed successfully` : 'Starts from the beginning'}

Return ONLY the fixed Python code, no explanations or markdown.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }
      
      const result = await response.json();
      return result.content[0].text;
      
    } catch (error) {
      return `❌ Failed to generate fix: ${error.message}\n\nORIGINAL PROTOCOL:\n${originalProtocol}`;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Opentrons MCP server running on stdio");
  }
}

const server = new OpentronsMCP();
server.run().catch(console.error);