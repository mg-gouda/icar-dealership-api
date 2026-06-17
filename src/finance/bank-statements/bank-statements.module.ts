import { Module } from '@nestjs/common';
import { BankStatementsController } from './bank-statements.controller';
import { BankStatementsService } from './bank-statements.service';

@Module({
  controllers: [BankStatementsController],
  providers: [BankStatementsService],
  exports: [BankStatementsService],
})
export class BankStatementsModule {}
