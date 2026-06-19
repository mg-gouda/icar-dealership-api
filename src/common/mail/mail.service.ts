import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured — emails will be logged only');
      return null;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    return this.transporter;
  }

  async send(opts: { to: string; subject: string; html: string; from?: string }) {
    const transport = this.getTransporter();
    const from = opts.from ?? (process.env.SMTP_FROM ?? 'noreply@icaregypt.com');
    if (!transport) {
      this.logger.log(`[EMAIL STUB] To: ${opts.to} | Subject: ${opts.subject}`);
      return;
    }
    await transport.sendMail({ from, ...opts });
  }

  async sendPasswordReset(to: string, token: string) {
    const adminUrl = process.env.ADMIN_URL ?? 'http://localhost:3001';
    const url = `${adminUrl}/reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'Reset Your iCar Password',
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, ignore this email.</p>`,
    });
  }

  async sendAppointmentReminder(to: string, name: string, date: string, time: string, location: string) {
    await this.send({
      to,
      subject: 'Appointment Reminder — iCar Dealership',
      html: `<p>Hi ${name},</p><p>Reminder: your <strong>${location}</strong> appointment is on <strong>${date} at ${time}</strong>.</p>`,
    });
  }

  async sendInvoiceEmail(to: string, invoiceRef: string, amount: number, dueDate: string) {
    const fmt = (n: number) => n.toLocaleString('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });
    await this.send({
      to,
      subject: `Invoice #${invoiceRef} — iCar Dealership`,
      html: `<p>Your invoice of <strong>${fmt(amount)}</strong> is due on <strong>${dueDate}</strong>.</p>`,
    });
  }

  async sendDealStatusUpdate(to: string, name: string, status: string, vehicleDesc: string) {
    await this.send({
      to,
      subject: 'Your Deal Status Has Been Updated — iCar',
      html: `<p>Hi ${name},</p><p>Your deal for <strong>${vehicleDesc}</strong> has been updated to <strong>${status.replace(/_/g, ' ')}</strong>.</p><p>Contact us at <a href="mailto:info@icaregypt.com">info@icaregypt.com</a> for more details.</p>`,
    });
  }
}
