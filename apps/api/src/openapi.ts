import {
  addCopiesSchema,
  createAcquisitionSourceSchema,
  createCollectionSchema,
  createDeckSchema,
  createTradeListItemSchema,
  createTradeListSchema,
  createWishListItemSchema,
  createWishListSchema,
  disposeCopiesSchema,
  moveCopiesSchema,
  updateAcquisitionSourceSchema,
  updateCollectionSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
  updatePreferencesSchema,
  updateTradeListSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "@openrift/shared/schemas";
import { z } from "zod/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAPI spec uses loosely-typed JSON
type JsonObject = Record<string, any>;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a Zod schema to a JSON Schema object for use in OpenAPI.
 * @returns JSON Schema object
 */
function zodToSchema(schema: z.ZodType): JsonObject {
  return z.toJSONSchema(schema) as JsonObject;
}

function jsonResponse(description: string, schema: JsonObject): JsonObject {
  return { description, content: { "application/json": { schema } } };
}

function emptyResponse(description: string): JsonObject {
  return { description };
}

function uuidParam(name: string, description: string): JsonObject {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
    description,
  };
}

const cursorParam: JsonObject = {
  name: "cursor",
  in: "query",
  schema: { type: "string", format: "date-time" },
  description: "Pagination cursor (ISO 8601 datetime)",
};

function limitParam(max: number, defaultVal: number): JsonObject {
  return {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: max, default: defaultVal },
    description: `Number of items to return (max ${String(max)})`,
  };
}

const errorSchema: JsonObject = {
  type: "object",
  properties: {
    error: { type: "string" },
    code: { type: "string" },
    details: {},
  },
  required: ["error", "code"],
};

const bearerAuth: JsonObject = {
  type: "http",
  scheme: "bearer",
  description: "Session cookie or Bearer token from better-auth",
};

// ── Spec ─────────────────────────────────────────────────────────────────────

/**
 * Builds the full OpenAPI 3.1.0 specification for the OpenRift API.
 * @returns OpenAPI document object
 */
function buildOpenApiSpec(): JsonObject {
  return {
    openapi: "3.1.0",
    info: {
      title: "OpenRift API",
      version: "1.0.0",
      description:
        "API for the OpenRift card collection browser for the Riftbound trading card game.",
    },
    servers: [{ url: "/", description: "Current server" }],
    tags: [
      { name: "Health", description: "Health check" },
      { name: "Catalog", description: "Card catalog (public)" },
      { name: "Prices", description: "Price data (public)" },
      {
        name: "Feature Flags",
        description: "Feature flags (public read, admin write)",
      },
      { name: "Keyword Styles", description: "Keyword styling (public)" },
      { name: "Collections", description: "Card collections" },
      { name: "Copies", description: "Card copies" },
      { name: "Activities", description: "Activity history" },
      { name: "Decks", description: "Deck management" },
      {
        name: "Acquisition Sources",
        description: "Where cards were acquired",
      },
      { name: "Preferences", description: "User preferences" },
      { name: "Wish Lists", description: "Wish list management" },
      { name: "Trade Lists", description: "Trade list management" },
      { name: "Shopping List", description: "Shopping list" },
      { name: "Admin", description: "Admin operations" },
    ],
    components: {
      securitySchemes: { bearerAuth },
      responses: {
        Unauthorized: jsonResponse("Unauthorized", errorSchema),
        Forbidden: jsonResponse("Forbidden", errorSchema),
        NotFound: jsonResponse("Not found", errorSchema),
        ValidationError: jsonResponse("Validation error", errorSchema),
      },
    },
    paths: {
      // ── Health ───────────────────────────────────────────────────────────
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          operationId: "healthCheck",
          responses: {
            "200": jsonResponse("Healthy", {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok", "db_empty"] },
              },
              required: ["status"],
            }),
            "503": jsonResponse("Unhealthy", {
              type: "object",
              properties: { status: { type: "string" } },
              required: ["status"],
            }),
          },
        },
      },

      // ── Catalog ──────────────────────────────────────────────────────────
      "/api/v1/catalog": {
        get: {
          tags: ["Catalog"],
          summary: "Get full card catalog",
          operationId: "getCatalog",
          description: "Returns all sets, cards, and printings. Supports ETag-based caching.",
          responses: {
            "200": jsonResponse("Full catalog", {
              type: "object",
              properties: {
                sets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      printedTotal: { type: "integer" },
                      releasedAt: {
                        type: "string",
                        format: "date",
                        nullable: true,
                      },
                    },
                  },
                },
                cards: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string" },
                      rarity: { type: "string" },
                      text: { type: "string", nullable: true },
                    },
                  },
                },
                printings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      cardId: { type: "string" },
                      setId: { type: "string" },
                      collectorNumber: { type: "string" },
                      finish: { type: "string" },
                      images: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            url: { type: "string" },
                            width: { type: "integer" },
                            height: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
            "304": emptyResponse("Not modified (ETag match)"),
          },
        },
      },

      // ── Prices ───────────────────────────────────────────────────────────
      "/api/v1/prices": {
        get: {
          tags: ["Prices"],
          summary: "Get latest prices for all printings",
          operationId: "getPrices",
          responses: {
            "200": jsonResponse("Prices map", {
              type: "object",
              properties: {
                prices: {
                  type: "object",
                  additionalProperties: { type: "number" },
                  description: "Map of printingId → price (USD)",
                },
              },
            }),
          },
        },
      },
      "/api/v1/prices/{printingId}/history": {
        get: {
          tags: ["Prices"],
          summary: "Get price history for a printing",
          operationId: "getPriceHistory",
          parameters: [
            uuidParam("printingId", "Printing ID"),
            {
              name: "range",
              in: "query",
              schema: {
                type: "string",
                enum: ["7d", "30d", "90d", "all"],
                default: "30d",
              },
            },
          ],
          responses: {
            "200": jsonResponse("Price history", {
              type: "object",
              properties: {
                printingId: { type: "string", format: "uuid" },
                tcgplayer: { type: "object", nullable: true },
                cardmarket: { type: "object", nullable: true },
                cardtrader: { type: "object", nullable: true },
              },
            }),
          },
        },
      },

      // ── Feature Flags ────────────────────────────────────────────────────
      "/api/v1/feature-flags": {
        get: {
          tags: ["Feature Flags"],
          summary: "Get enabled feature flags",
          operationId: "getFeatureFlags",
          responses: {
            "200": jsonResponse("Feature flags", {
              type: "object",
              properties: {
                items: {
                  type: "object",
                  additionalProperties: { type: "boolean" },
                },
              },
            }),
          },
        },
      },

      // ── Keyword Styles ───────────────────────────────────────────────────
      "/api/v1/keyword-styles": {
        get: {
          tags: ["Keyword Styles"],
          summary: "Get keyword styles",
          operationId: "getKeywordStyles",
          responses: {
            "200": jsonResponse("Keyword styles", {
              type: "object",
              properties: {
                items: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      color: { type: "string" },
                      darkText: { type: "boolean" },
                    },
                  },
                },
              },
            }),
          },
        },
      },

      // ── Collections ──────────────────────────────────────────────────────
      "/api/v1/collections": {
        get: {
          tags: ["Collections"],
          summary: "List all collections",
          operationId: "listCollections",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Collections list", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Collection" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Collections"],
          summary: "Create a collection",
          operationId: "createCollection",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createCollectionSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created collection", {
              $ref: "#/components/schemas/Collection",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/collections/{id}": {
        get: {
          tags: ["Collections"],
          summary: "Get a collection",
          operationId: "getCollection",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Collection ID")],
          responses: {
            "200": jsonResponse("Collection", {
              $ref: "#/components/schemas/Collection",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Collections"],
          summary: "Update a collection",
          operationId: "updateCollection",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Collection ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateCollectionSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated collection", {
              $ref: "#/components/schemas/Collection",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Collections"],
          summary: "Delete a collection",
          operationId: "deleteCollection",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Collection ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/collections/{id}/copies": {
        get: {
          tags: ["Collections"],
          summary: "List copies in a collection",
          operationId: "listCollectionCopies",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Collection ID"), cursorParam, limitParam(500, 200)],
          responses: {
            "200": jsonResponse("Copies list", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Copy" } },
                nextCursor: { type: "string", nullable: true },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },

      // ── Copies ───────────────────────────────────────────────────────────
      "/api/v1/copies": {
        get: {
          tags: ["Copies"],
          summary: "List all copies",
          operationId: "listCopies",
          security: [{ bearerAuth: [] }],
          parameters: [cursorParam, limitParam(500, 200)],
          responses: {
            "200": jsonResponse("Copies list", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Copy" } },
                nextCursor: { type: "string", nullable: true },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Copies"],
          summary: "Add copies",
          operationId: "addCopies",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(addCopiesSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created copies", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Copy" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/copies/move": {
        post: {
          tags: ["Copies"],
          summary: "Move copies to another collection",
          operationId: "moveCopies",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(moveCopiesSchema),
              },
            },
          },
          responses: {
            "204": emptyResponse("Moved"),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/copies/dispose": {
        post: {
          tags: ["Copies"],
          summary: "Dispose (remove) copies",
          operationId: "disposeCopies",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(disposeCopiesSchema),
              },
            },
          },
          responses: {
            "204": emptyResponse("Disposed"),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/copies/count": {
        get: {
          tags: ["Copies"],
          summary: "Count copies by printing",
          operationId: "countCopies",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Copy counts", {
              type: "object",
              properties: {
                items: {
                  type: "object",
                  additionalProperties: { type: "integer" },
                  description: "Map of printingId → count",
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/copies/{id}": {
        get: {
          tags: ["Copies"],
          summary: "Get a single copy",
          operationId: "getCopy",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Copy ID")],
          responses: {
            "200": jsonResponse("Copy", { $ref: "#/components/schemas/Copy" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ── Activities ───────────────────────────────────────────────────────
      "/api/v1/activities": {
        get: {
          tags: ["Activities"],
          summary: "List activities",
          operationId: "listActivities",
          security: [{ bearerAuth: [] }],
          parameters: [cursorParam, limitParam(100, 50)],
          responses: {
            "200": jsonResponse("Activities", {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Activity" },
                },
                nextCursor: { type: "string", nullable: true },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/activities/{id}": {
        get: {
          tags: ["Activities"],
          summary: "Get activity detail",
          operationId: "getActivity",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Activity ID")],
          responses: {
            "200": jsonResponse("Activity detail", {
              type: "object",
              properties: {
                activity: { $ref: "#/components/schemas/Activity" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      printingId: { type: "string" },
                      fromCollectionId: {
                        type: "string",
                        format: "uuid",
                        nullable: true,
                      },
                      toCollectionId: {
                        type: "string",
                        format: "uuid",
                        nullable: true,
                      },
                    },
                  },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ── Decks ────────────────────────────────────────────────────────────
      "/api/v1/decks": {
        get: {
          tags: ["Decks"],
          summary: "List decks",
          operationId: "listDecks",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "wanted",
              in: "query",
              schema: { type: "string", enum: ["true", "false"] },
              description: 'Filter by wanted status ("true" or "false")',
            },
          ],
          responses: {
            "200": jsonResponse("Decks", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Deck" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Decks"],
          summary: "Create a deck",
          operationId: "createDeck",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createDeckSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created deck", { $ref: "#/components/schemas/Deck" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/decks/{id}": {
        get: {
          tags: ["Decks"],
          summary: "Get deck with cards",
          operationId: "getDeck",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Deck ID")],
          responses: {
            "200": jsonResponse("Deck detail", {
              type: "object",
              properties: {
                deck: { $ref: "#/components/schemas/Deck" },
                cards: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DeckCard" },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Decks"],
          summary: "Update a deck",
          operationId: "updateDeck",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Deck ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateDeckSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated deck", { $ref: "#/components/schemas/Deck" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Decks"],
          summary: "Delete a deck",
          operationId: "deleteDeck",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Deck ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/decks/{id}/cards": {
        put: {
          tags: ["Decks"],
          summary: "Replace deck cards",
          operationId: "updateDeckCards",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Deck ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateDeckCardsSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated cards", {
              type: "object",
              properties: {
                cards: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DeckCard" },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/decks/{id}/availability": {
        get: {
          tags: ["Decks"],
          summary: "Check card availability for a deck",
          operationId: "getDeckAvailability",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Deck ID")],
          responses: {
            "200": jsonResponse("Availability", {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      cardId: { type: "string" },
                      zone: {
                        type: "string",
                        enum: ["main", "sideboard"],
                      },
                      quantity: { type: "integer" },
                      owned: { type: "integer" },
                      available: { type: "integer" },
                    },
                  },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ── Acquisition Sources ──────────────────────────────────────────────
      "/api/v1/acquisition-sources": {
        get: {
          tags: ["Acquisition Sources"],
          summary: "List acquisition sources",
          operationId: "listAcquisitionSources",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Sources", {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: { $ref: "#/components/schemas/AcquisitionSource" },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Acquisition Sources"],
          summary: "Create an acquisition source",
          operationId: "createAcquisitionSource",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createAcquisitionSourceSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created", {
              $ref: "#/components/schemas/AcquisitionSource",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/acquisition-sources/{id}": {
        get: {
          tags: ["Acquisition Sources"],
          summary: "Get an acquisition source",
          operationId: "getAcquisitionSource",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Source ID")],
          responses: {
            "200": jsonResponse("Source", {
              $ref: "#/components/schemas/AcquisitionSource",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Acquisition Sources"],
          summary: "Update an acquisition source",
          operationId: "updateAcquisitionSource",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Source ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateAcquisitionSourceSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated", {
              $ref: "#/components/schemas/AcquisitionSource",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Acquisition Sources"],
          summary: "Delete an acquisition source",
          operationId: "deleteAcquisitionSource",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Source ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ── Preferences ──────────────────────────────────────────────────────
      "/api/v1/preferences": {
        get: {
          tags: ["Preferences"],
          summary: "Get user preferences",
          operationId: "getPreferences",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Preferences", {
              $ref: "#/components/schemas/Preferences",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        patch: {
          tags: ["Preferences"],
          summary: "Update user preferences",
          operationId: "updatePreferences",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updatePreferencesSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated preferences", {
              $ref: "#/components/schemas/Preferences",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },

      // ── Wish Lists ───────────────────────────────────────────────────────
      "/api/v1/wish-lists": {
        get: {
          tags: ["Wish Lists"],
          summary: "List wish lists",
          operationId: "listWishLists",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Wish lists", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/WishList" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Wish Lists"],
          summary: "Create a wish list",
          operationId: "createWishList",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createWishListSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created", { $ref: "#/components/schemas/WishList" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/wish-lists/{id}": {
        get: {
          tags: ["Wish Lists"],
          summary: "Get wish list with items",
          operationId: "getWishList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID")],
          responses: {
            "200": jsonResponse("Wish list detail", {
              type: "object",
              properties: {
                wishList: { $ref: "#/components/schemas/WishList" },
                items: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WishListItem" },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Wish Lists"],
          summary: "Update a wish list",
          operationId: "updateWishList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateWishListSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated", { $ref: "#/components/schemas/WishList" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Wish Lists"],
          summary: "Delete a wish list",
          operationId: "deleteWishList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/wish-lists/{id}/items": {
        post: {
          tags: ["Wish Lists"],
          summary: "Add item to wish list",
          operationId: "createWishListItem",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createWishListItemSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created item", {
              $ref: "#/components/schemas/WishListItem",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/wish-lists/{id}/items/{itemId}": {
        patch: {
          tags: ["Wish Lists"],
          summary: "Update wish list item",
          operationId: "updateWishListItem",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID"), uuidParam("itemId", "Item ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateWishListItemSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated item", {
              $ref: "#/components/schemas/WishListItem",
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        delete: {
          tags: ["Wish Lists"],
          summary: "Remove item from wish list",
          operationId: "deleteWishListItem",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Wish list ID"), uuidParam("itemId", "Item ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },

      // ── Trade Lists ──────────────────────────────────────────────────────
      "/api/v1/trade-lists": {
        get: {
          tags: ["Trade Lists"],
          summary: "List trade lists",
          operationId: "listTradeLists",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Trade lists", {
              type: "object",
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/TradeList" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Trade Lists"],
          summary: "Create a trade list",
          operationId: "createTradeList",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createTradeListSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created", { $ref: "#/components/schemas/TradeList" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/trade-lists/{id}": {
        get: {
          tags: ["Trade Lists"],
          summary: "Get trade list with items",
          operationId: "getTradeList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Trade list ID")],
          responses: {
            "200": jsonResponse("Trade list detail", {
              type: "object",
              properties: {
                tradeList: { $ref: "#/components/schemas/TradeList" },
                items: { type: "array", items: { type: "object" } },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Trade Lists"],
          summary: "Update a trade list",
          operationId: "updateTradeList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Trade list ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(updateTradeListSchema),
              },
            },
          },
          responses: {
            "200": jsonResponse("Updated", { $ref: "#/components/schemas/TradeList" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Trade Lists"],
          summary: "Delete a trade list",
          operationId: "deleteTradeList",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Trade list ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/trade-lists/{id}/items": {
        post: {
          tags: ["Trade Lists"],
          summary: "Add item to trade list",
          operationId: "createTradeListItem",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Trade list ID")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToSchema(createTradeListItemSchema),
              },
            },
          },
          responses: {
            "201": jsonResponse("Created item", { type: "object" }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/trade-lists/{id}/items/{itemId}": {
        delete: {
          tags: ["Trade Lists"],
          summary: "Remove item from trade list",
          operationId: "deleteTradeListItem",
          security: [{ bearerAuth: [] }],
          parameters: [uuidParam("id", "Trade list ID"), uuidParam("itemId", "Item ID")],
          responses: {
            "204": emptyResponse("Deleted"),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },

      // ── Shopping List ────────────────────────────────────────────────────
      "/api/v1/shopping-list": {
        get: {
          tags: ["Shopping List"],
          summary: "Get shopping list",
          operationId: "getShoppingList",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": jsonResponse("Shopping list", {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ShoppingListItem" },
                },
              },
            }),
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
    },
  };
}

// Attach reusable schemas via a separate function so the spec stays readable.
// Called once at startup and mutates the spec's components.schemas in place.

/**
 * Adds reusable component schemas to the OpenAPI spec.
 * @returns The spec with schemas attached
 */
export function buildOpenApiSpecWithSchemas(): JsonObject {
  const spec = buildOpenApiSpec();

  spec.components ??= {};
  spec.components.schemas = {
    Collection: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        availableForDeckbuilding: { type: "boolean" },
        copyCount: { type: "integer" },
        sortOrder: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "id",
        "name",
        "availableForDeckbuilding",
        "copyCount",
        "sortOrder",
        "createdAt",
        "updatedAt",
      ],
    },
    Copy: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        printingId: { type: "string" },
        collectionId: { type: "string", format: "uuid" },
        acquisitionSourceId: { type: "string", format: "uuid", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
      required: ["id", "printingId", "collectionId", "createdAt"],
    },
    Activity: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["acquisition", "disposal", "trade", "reorganization"] },
        itemCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
      },
      required: ["id", "type", "itemCount", "createdAt"],
    },
    Deck: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        format: { type: "string", enum: ["standard", "freeform"] },
        isWanted: { type: "boolean" },
        isPublic: { type: "boolean" },
        cardCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "id",
        "name",
        "format",
        "isWanted",
        "isPublic",
        "cardCount",
        "createdAt",
        "updatedAt",
      ],
    },
    DeckCard: {
      type: "object",
      properties: {
        cardId: { type: "string" },
        zone: { type: "string", enum: ["main", "sideboard"] },
        quantity: { type: "integer" },
      },
      required: ["cardId", "zone", "quantity"],
    },
    AcquisitionSource: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "createdAt", "updatedAt"],
    },
    Preferences: {
      type: "object",
      properties: {
        showImages: { type: "boolean" },
        richEffects: { type: "boolean" },
        theme: { type: "string", enum: ["light", "dark"] },
        visibleFields: {
          type: "object",
          properties: {
            number: { type: "boolean" },
            title: { type: "boolean" },
            type: { type: "boolean" },
            rarity: { type: "boolean" },
            price: { type: "boolean" },
          },
        },
      },
      required: ["showImages", "richEffects", "theme", "visibleFields"],
    },
    WishList: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        itemCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "itemCount", "createdAt", "updatedAt"],
    },
    WishListItem: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        cardId: { type: "string", nullable: true },
        printingId: { type: "string", nullable: true },
        quantityDesired: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
      },
      required: ["id", "quantityDesired", "createdAt"],
    },
    TradeList: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        itemCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "itemCount", "createdAt", "updatedAt"],
    },
    ShoppingListItem: {
      type: "object",
      properties: {
        cardId: { type: "string" },
        printingId: { type: "string", nullable: true },
        quantityNeeded: { type: "integer" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              marketplace: { type: "string" },
              price: { type: "number" },
              url: { type: "string" },
            },
          },
        },
      },
      required: ["cardId", "quantityNeeded"],
    },
  };

  return spec;
}
