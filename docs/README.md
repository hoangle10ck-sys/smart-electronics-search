# Project documentation

Project guides and reports are grouped here so the repository root stays focused on the application.

## Folders

- [Catalog guides](catalog/guides/) — product catalog and data collection workflows.
- [Catalog research](catalog/research/) — source research, checkpoints, and enrichment notes.
- [Catalog reports](catalog/reports/) — generated catalog coverage, quality, and import reports.
- [Catalog verification](catalog/verification/) — URL, image, model, and import verification evidence.
- [Project audits](audits/) — architecture, acceptance, and frontend audit documents.
- [Security](security/) — historical Silo provisioning and gateway reports.

The MongoDB database remains the live catalog source of truth. Files in `catalog/reports/` and `catalog/verification/` are snapshots or audit evidence; they do not drive the public product data by themselves.
