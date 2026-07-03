// Card / printing / candidate / errata field rules live in `@openrift/shared`
// so both the API (admin endpoints, candidate ingest) and the shared contracts
// (admin card mutations) plus the web app (contribute form, JSON Schema
// generation for openrift-data) can reuse them.
export {
  cardErrataFieldRules,
  cardFieldRules,
  candidateCardFieldRules,
  candidatePrintingFieldRules,
} from "@openrift/shared/db-field-rules";
