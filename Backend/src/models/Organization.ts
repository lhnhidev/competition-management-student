import mongoose, { Schema } from 'mongoose';

export type OrganizationRole = 'admin' | 'teacher' | 'student' | 'redflag';
export type OrganizationMemberStatus = 'approved' | 'pending';
export type OrganizationSchoolLevel = 1 | 2 | 3;

export type OrganizationMember = {
  user: mongoose.Types.ObjectId;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  joinedAt?: Date;
  requestMessage?: string;
  requestedAt?: Date;
};

export type OrganizationType = {
  name: string;
  shortName?: string;
  description?: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  schoolLevel: OrganizationSchoolLevel;
  allowJoinByInviteWithoutApproval: boolean;
  defaultJoinRole?: OrganizationRole;
  inviteCode: string;
  owner: mongoose.Types.ObjectId;
  members: OrganizationMember[];
};

const MemberSchema = new Schema<OrganizationMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'redflag'],
      required: true,
      default: 'student',
    },
    status: {
      type: String,
      enum: ['approved', 'pending'],
      required: true,
      default: 'pending',
    },
    joinedAt: { type: Date, default: null },
    requestMessage: { type: String, default: '', trim: true },
    requestedAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrganizationSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    website: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    schoolLevel: {
      type: Number,
      enum: [1, 2, 3],
      default: 3,
      required: true,
    },
    allowJoinByInviteWithoutApproval: { type: Boolean, default: true },
    defaultJoinRole: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'redflag'],
      default: 'student',
    },
    inviteCode: { type: String, required: true, unique: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [MemberSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

OrganizationSchema.index({ 'members.user': 1 });

export default mongoose.model<OrganizationType>('Organization', OrganizationSchema, 'Organization');
