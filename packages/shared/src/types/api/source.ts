export interface AcquisitionSourceListResponse {
  sources: AcquisitionSourceResponse[];
}

export interface AcquisitionSourceResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
