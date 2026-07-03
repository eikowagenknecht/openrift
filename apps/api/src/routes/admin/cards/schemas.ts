// The errata-upload and candidate-ingest schemas are defined once in the
// shared oRPC contract (they validate the same endpoints' wire shapes there);
// re-exported here for the services that consume the inferred types.
export type {
  IngestCard,
  IngestPrinting,
  UploadErrataEntry,
} from "@openrift/shared/contracts/admin/card-mutations";
