import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceRecord extends Document {
  worker: mongoose.Types.ObjectId;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  shift: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
  overtimeHours: number;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    worker: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    shift: { type: String, required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'], required: true },
    overtimeHours: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.AttendanceRecord || mongoose.model<IAttendanceRecord>('AttendanceRecord', AttendanceRecordSchema);
