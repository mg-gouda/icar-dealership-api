-- Create PostgreSQL sequence for race-free invoice number generation
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- Replace global unique on Invoice.number with composite unique on (journalId, number)
-- The composite allows different journals to share number formats without collision
DROP INDEX IF EXISTS "Invoice_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_journalId_number_key" ON "Invoice"("journalId", "number");
