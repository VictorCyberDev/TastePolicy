import { z } from "zod";
import {
  AUTHORITY_BOUNDARY,
  PLATFORM_CONTRACT_VERSION,
  emptyInput,
  evaluateInput,
  evaluationRefInput,
  passportInput,
} from "./contracts";

const schema = (s: z.ZodType) => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(s) as Record<
    string,
    unknown
  >;
  void _ignored;
  return rest;
};
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
});
const op = (
  summary: string,
  scope: string | null,
  body: z.ZodType,
  extra: Record<string, unknown> = {},
) => ({
  summary,
  description: `${AUTHORITY_BOUNDARY}${scope ? ` Requires credential scope ${scope}.` : ""}`,
  security: [{ bearer: [] }],
  requestBody: {
    required: true,
    content: { "application/json": { schema: schema(body) } },
  },
  responses: {
    "200": {
      description: "Available",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Envelope" },
        },
      },
    },
    "400": errorResponse("INVALID_INPUT"),
    "401": errorResponse("AUTH_REQUIRED"),
    "403": errorResponse("ACCESS_DENIED and grant/credential states"),
    "404": errorResponse("PASSPORT_NOT_FOUND"),
    "409": errorResponse("STATE_VERSION_CONFLICT or IDEMPOTENCY_KEY_CONFLICT"),
    "429": errorResponse("RATE_LIMITED"),
    "503": errorResponse("NOT_CONFIGURED or PROVIDER_UNAVAILABLE"),
  },
  ...extra,
});
// Generated from the shared contract; REST, MCP, A2A and the SDK use the same
// schemas, so this document cannot drift from them.
export function openApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "TastePolicy Preference Authority API",
      version: PLATFORM_CONTRACT_VERSION,
      description: AUTHORITY_BOUNDARY,
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/capabilities": {
        post: op("Describe capabilities", null, emptyInput),
      },
      "/api/v1/passport": {
        post: op("Read Passport summary", "PASSPORT_READ", passportInput),
      },
      "/api/v1/evaluate": {
        post: op("Evaluate a proposed choice", "TASTE_EVALUATE", evaluateInput),
      },
      "/api/v1/receipt": {
        post: op("Read a recorded receipt", "RECEIPT_READ", evaluationRefInput),
      },
      "/api/v1/status": {
        post: op("Read evaluation status", "RECEIPT_READ", evaluationRefInput),
      },
    },
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "TastePolicy developer credential (tp_live_…)",
        },
      },
      schemas: {
        Envelope: {
          type: "object",
          required: ["status", "data", "requestId"],
          properties: {
            status: { const: "available" },
            data: { type: "object" },
            requestId: { type: "string" },
          },
        },
        Error: {
          type: "object",
          required: ["status", "code", "requestId"],
          properties: {
            status: { const: "error" },
            code: { type: "string" },
            requestId: { type: "string" },
          },
        },
      },
    },
  };
}
