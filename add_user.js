require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/auma-inventory');
  
  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: { type: String, select: false },
    role: String,
    isActive: Boolean
  }, { timestamps: true });
  
  const User = mongoose.models.User || mongoose.model('User', userSchema);
  
  // Check if user exists
  const existingUser = await User.findOne({ email: 'newadmin@auma.com' });
  if (existingUser) {
    console.log('User already exists:', existingUser.email);
    process.exit(0);
  }

  const user = await User.create({
    name: 'New Admin',
    email: 'newadmin@auma.com',
    password: 'password123',
    role: 'ADMIN',
    isActive: true
  });
  
  console.log('User created:', user.email);
  process.exit(0);
}

run().catch(console.dir);
