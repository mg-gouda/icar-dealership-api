import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Race-free invoice number via PostgreSQL sequence.
 * nextval('invoice_seq') is atomic — no SELECT/COUNT race condition.
 * Sequence created by migration 20260709000000_invoice_sequence_and_unique.
 */
export async function generateInvoiceNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  _companyId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  // ponytail: PG sequence is the only race-free way to get a unique serial
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('invoice_seq')
  `;
  const seq = Number(rows[0].nextval);
  return `INV-${year}-${String(seq).padStart(5, '0')}`;
}
