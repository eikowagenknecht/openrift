// Card / printing / candidate / errata field rules live in `@openrift/shared`
// so both the API (admin endpoints, candidate ingest) and the shared contracts
// (admin card mutations) plus the web app (contribute form, JSON Schema
// generation for openrift-data) can reuse them. Only the rules the API still
// consumes through this module are re-exported; import the rest from
// `@openrift/shared/db-field-rules` directly.
export {
  candidateCardFieldRules,
  candidatePrintingFieldRules,
} from "@openrift/shared/db-field-rules";
