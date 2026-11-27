import mongoose, { Schema, Document } from 'mongoose';

export const NOTIFY_EVENTS = ['PO_DISPATCH', 'ORDER_CONFIRMATION', 'DISPATCH_ALERT', 'FOLLOWUP_DUE'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export type NotifyChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface INotificationTemplate extends Document {
  event: NotifyEvent;
  channel: NotifyChannel;
  subject?: string;
  body: string; // may use {{variables}}
  enabled: boolean;
}

export interface INotificationLog extends Document {
  event: NotifyEvent;
  channel: NotifyChannel;
  to: string;
  subject?: string;
  body: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
  refType?: string;
  refNumber?: string;
  attachments?: string[];
  createdAt: Date;
}

const TemplateSchema = new Schema<INotificationTemplate>(
  {
    event: { type: String, enum: NOTIFY_EVENTS, required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS', 'WHATSAPP'], required: true },
    subject: String,
    body: { type: String, required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);
TemplateSchema.index({ event: 1, channel: 1 }, { unique: true });

const LogSchema = new Schema<INotificationLog>(
  {
    event: { type: String, enum: NOTIFY_EVENTS, required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS', 'WHATSAPP'], required: true },
    to: { type: String, required: true },
    subject: String,
    body: { type: String, required: true },
    status: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED'], required: true },
    error: String,
    refType: String,
    refNumber: String,
    attachments: [String],
  },
  { timestamps: true }
);

export const NotificationTemplate = mongoose.models.NotificationTemplate || mongoose.model<INotificationTemplate>('NotificationTemplate', TemplateSchema);
export const NotificationLog = mongoose.models.NotificationLog || mongoose.model<INotificationLog>('NotificationLog', LogSchema);
