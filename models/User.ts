import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'SALES' | 'VIEWER' | 'PRODUCTION_MANAGER' | 'QUALITY_INSPECTOR' | 'FINANCE_MANAGER' | 'HR_MANAGER' | 'SUPPLY_CHAIN_MANAGER';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, select: false }, // Store bcrypt hashed password, hidden by default
    role: {
      type: String,
      enum: ['ADMIN', 'MANAGER', 'STAFF', 'SALES', 'VIEWER', 'PRODUCTION_MANAGER', 'QUALITY_INSPECTOR', 'FINANCE_MANAGER', 'HR_MANAGER', 'SUPPLY_CHAIN_MANAGER'],
      default: 'VIEWER',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Pre-save hook to hash password with bcryptjs before saving into MongoDB
UserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }

  // Only hash if password is not already a bcrypt hash
  if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// Method to verify password during login
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return await bcrypt.compare(candidatePassword, this.password);
  }
  return candidatePassword === this.password;
};

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
