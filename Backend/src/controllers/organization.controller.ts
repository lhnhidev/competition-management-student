/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import Organization from '../models/Organization';
import User from '../models/User';
import Notification from '../models/Notification';
import Class from '../models/Class';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Role from '../models/Role';
import RecordForm from '../models/RecordForm';
import ResponseModel from '../models/Response';
import SocialMessage from '../models/SocialMessage';

const roleMap: Record<string, string> = {
  user: 'redflag',
  teacher: 'teacher',
  student: 'student',
  admin: 'admin',
};

const allowedOrgRoles = new Set(['admin', 'teacher', 'student', 'redflag']);

const randomInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const buildUniqueInviteCode = async () => {
  let code = '';
  let exists = true;

  while (exists) {
    code = randomInviteCode();
    const found = await Organization.findOne({ inviteCode: code }).select('_id').lean();
    exists = Boolean(found);
  }

  return code;
};

const getMyRoleInOrganization = (org: any, userId: string) => {
  const member = (org.members || []).find((item: any) => String(item.user) === String(userId));
  return member ? member.role : null;
};

export const getMyOrganizations = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const currentUserId = String(currentUser?._id || '');

    const organizations = await Organization.find({ 'members.user': currentUserId })
      .select(
        'name shortName description address website contactEmail contactPhone schoolLevel allowJoinByInviteWithoutApproval defaultJoinRole inviteCode owner members createdAt'
      )
      .lean();

    const mapped = organizations
      .map((org: any) => {
        const member = (org.members || []).find((item: any) => String(item.user) === currentUserId);
        if (!member) return null;

        return {
          _id: String(org._id),
          name: org.name,
          shortName: org.shortName,
          description: org.description,
          address: org.address,
          website: org.website,
          contactEmail: org.contactEmail,
          contactPhone: org.contactPhone,
          schoolLevel: Number(org.schoolLevel) || 3,
          inviteCode: org.inviteCode,
          allowJoinByInviteWithoutApproval: Boolean(org.allowJoinByInviteWithoutApproval),
          defaultJoinRole: org.defaultJoinRole || 'student',
          role: member.role,
          status: member.status,
          joinedAt: member.joinedAt,
          createdAt: org.createdAt,
          isOwner: String(org.owner) === currentUserId,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const joinedA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
        const joinedB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
        if (joinedA !== joinedB) return joinedB - joinedA;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    return res.status(200).json(mapped);
  } catch (error) {
    console.error('getMyOrganizations error:', error);
    return res.status(500).json({ message: 'Loi server khi tai danh sach to chuc' });
  }
};

export const createOrganization = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const currentUserId = String(currentUser?._id || '');

    const name = String(req.body?.name || '').trim();
    const shortName = String(req.body?.shortName || '').trim();
    const description = String(req.body?.description || '').trim();
    const address = String(req.body?.address || '').trim();
    const website = String(req.body?.website || '').trim();
    const contactEmail = String(req.body?.contactEmail || '').trim();
    const contactPhone = String(req.body?.contactPhone || '').trim();
    const schoolLevelRaw = Number(req.body?.schoolLevel);
    const allowJoinByInviteWithoutApproval = Boolean(req.body?.allowJoinByInviteWithoutApproval);
    const defaultJoinRole = String(req.body?.defaultJoinRole || '').trim().toLowerCase();

    if (!name) {
      return res.status(400).json({ message: 'Ten to chuc la bat buoc' });
    }

    if (![1, 2, 3].includes(schoolLevelRaw)) {
      return res.status(400).json({ message: 'Vui long chon cap truong hop le' });
    }

    if (allowJoinByInviteWithoutApproval) {
      if (!defaultJoinRole || !allowedOrgRoles.has(defaultJoinRole)) {
        return res.status(400).json({ message: 'Vui long chon quyen mac dinh hop le' });
      }
    }

    const inviteCode = await buildUniqueInviteCode();

    const organization = await Organization.create({
      name,
      shortName,
      description,
      address,
      website,
      contactEmail,
      contactPhone,
      schoolLevel: schoolLevelRaw,
      allowJoinByInviteWithoutApproval,
      defaultJoinRole: allowJoinByInviteWithoutApproval ? defaultJoinRole : 'student',
      inviteCode,
      owner: currentUserId,
      members: [
        {
          user: currentUserId,
          role: 'admin',
          status: 'approved',
          joinedAt: new Date(),
        },
      ],
    });

    return res.status(201).json({
      _id: organization._id,
      name: organization.name,
      shortName: organization.shortName,
      description: organization.description,
      address: organization.address,
      website: organization.website,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      schoolLevel: organization.schoolLevel,
      allowJoinByInviteWithoutApproval: organization.allowJoinByInviteWithoutApproval,
      defaultJoinRole: organization.defaultJoinRole || 'student',
      inviteCode: organization.inviteCode,
      role: 'admin',
      status: 'approved',
      joinedAt: new Date(),
      isOwner: true,
    });
  } catch (error) {
    console.error('createOrganization error:', error);
    return res.status(500).json({ message: 'Loi server khi tao to chuc' });
  }
};

export const joinOrganizationByInviteCode = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const currentUserId = String(currentUser?._id || '');
    const inviteCode = String(req.params?.inviteCode || '').trim().toUpperCase();
    const desiredRole = String(req.body?.role || '').trim().toLowerCase();
    const requestMessage = String(req.body?.requestMessage || '').trim();

    if (!inviteCode) {
      return res.status(400).json({ message: 'Ma moi la bat buoc' });
    }

    const organization = await Organization.findOne({ inviteCode });
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc voi ma moi nay' });
    }

    const existingMember = organization.members.find((item: any) => String(item.user) === currentUserId);
    if (existingMember) {
      return res.status(200).json({
        message:
          existingMember.status === 'approved'
            ? 'Ban da la thanh vien cua to chuc nay'
            : 'Yeu cau tham gia cua ban dang cho duyet',
        status: existingMember.status,
      });
    }

    const roleFromUser = roleMap[String(currentUser.role || '').toLowerCase()] || 'student';
    const autoApprove = Boolean(organization.allowJoinByInviteWithoutApproval);

    if (!autoApprove) {
      if (!desiredRole || !allowedOrgRoles.has(desiredRole)) {
        return res.status(400).json({ message: 'Vui long chon vai tro muon tham gia' });
      }

      if (!requestMessage) {
        return res.status(400).json({ message: 'Vui long nhap noi dung kem theo' });
      }
    }

    const finalRole = autoApprove
      ? String(organization.defaultJoinRole || roleFromUser)
      : desiredRole;

    organization.members.push({
      user: currentUserId as any,
      role: finalRole as any,
      status: autoApprove ? 'approved' : 'pending',
      ...(autoApprove
        ? { joinedAt: new Date() }
        : {
            requestMessage,
            requestedAt: new Date(),
          }),
    });

    await organization.save();

    return res.status(200).json({
      message: autoApprove ? 'Tham gia to chuc thanh cong' : 'Da gui yeu cau tham gia, vui long cho duyet',
      status: autoApprove ? 'approved' : 'pending',
      role: finalRole,
    });
  } catch (error) {
    console.error('joinOrganizationByInviteCode error:', error);
    return res.status(500).json({ message: 'Loi server khi tham gia to chuc' });
  }
};

export const getOrganizationInviteInfo = async (req: Request, res: Response) => {
  try {
    const inviteCode = String(req.params?.inviteCode || '').trim().toUpperCase();
    if (!inviteCode) {
      return res.status(400).json({ message: 'Ma moi la bat buoc' });
    }

    const organization = await Organization.findOne({ inviteCode })
      .select('name allowJoinByInviteWithoutApproval defaultJoinRole')
      .lean();

    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc voi ma moi nay' });
    }

    return res.status(200).json({
      name: organization.name,
      allowJoinByInviteWithoutApproval: Boolean(organization.allowJoinByInviteWithoutApproval),
      defaultJoinRole: organization.defaultJoinRole || 'student',
    });
  } catch (error) {
    console.error('getOrganizationInviteInfo error:', error);
    return res.status(500).json({ message: 'Loi server khi kiem tra ma moi' });
  }
};

export const getPendingOrganizationMembers = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const orgId = String(req.params?.orgId || '').trim();

    if (!orgId) {
      return res.status(400).json({ message: 'Thieu thong tin orgId' });
    }

    const organization = await Organization.findById(orgId).select('name owner members').lean();
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const myRole = getMyRoleInOrganization(organization, String(currentUser._id));
    if (myRole !== 'admin') {
      return res.status(403).json({ message: 'Ban khong co quyen xem danh sach cho duyet' });
    }

    const pendingMembers = (organization.members || []).filter((member: any) => member.status === 'pending');
    if (pendingMembers.length === 0) {
      return res.status(200).json([]);
    }

    const memberIds = pendingMembers.map((member: any) => member.user);
    const users = await User.find({ _id: { $in: memberIds } })
      .select('firstName lastName email')
      .lean();

    const userMap = new Map<string, any>();
    users.forEach((user) => userMap.set(String(user._id), user));

    const response = pendingMembers
      .map((member: any) => {
        const user = userMap.get(String(member.user));
        if (!user) return null;
        return {
          userId: String(member.user),
          fullName: `${user.lastName || ''} ${user.firstName || ''}`.trim(),
          email: user.email || '',
          role: member.role,
          requestMessage: member.requestMessage || '',
          requestedAt: member.requestedAt || null,
        };
      })
      .filter(Boolean);

    return res.status(200).json(response);
  } catch (error) {
    console.error('getPendingOrganizationMembers error:', error);
    return res.status(500).json({ message: 'Loi server khi tai danh sach cho duyet' });
  }
};

export const approveOrganizationMember = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const orgId = String(req.params?.orgId || '').trim();
    const memberUserId = String(req.params?.memberUserId || '').trim();

    if (!orgId || !memberUserId) {
      return res.status(400).json({ message: 'Thieu thong tin orgId hoac memberUserId' });
    }

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const myRole = getMyRoleInOrganization(organization, String(currentUser._id));
    if (myRole !== 'admin') {
      return res.status(403).json({ message: 'Ban khong co quyen duyet thanh vien' });
    }

    const member = organization.members.find((item: any) => String(item.user) === memberUserId);
    if (!member) {
      return res.status(404).json({ message: 'Khong tim thay thanh vien can duyet' });
    }

    member.status = 'approved';
    member.joinedAt = new Date();
    member.requestMessage = member.requestMessage || '';
    member.requestedAt = member.requestedAt || undefined;
    await organization.save();

    return res.status(200).json({ message: 'Duyet thanh vien thanh cong' });
  } catch (error) {
    console.error('approveOrganizationMember error:', error);
    return res.status(500).json({ message: 'Loi server khi duyet thanh vien' });
  }
};

export const rejectOrganizationMember = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const orgId = String(req.params?.orgId || '').trim();
    const memberUserId = String(req.params?.memberUserId || '').trim();

    if (!orgId || !memberUserId) {
      return res.status(400).json({ message: 'Thieu thong tin orgId hoac memberUserId' });
    }

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const myRole = getMyRoleInOrganization(organization, String(currentUser._id));
    if (myRole !== 'admin') {
      return res.status(403).json({ message: 'Ban khong co quyen tu choi thanh vien' });
    }

    const beforeCount = organization.members.length;
    organization.members = (organization.members || []).filter(
      (member: any) => String(member.user) !== memberUserId
    );

    if (organization.members.length === beforeCount) {
      return res.status(404).json({ message: 'Khong tim thay thanh vien can tu choi' });
    }

    await organization.save();

    const message = `Yeu cau tham gia to chuc ${organization.name} da bi tu choi.`;
    await Notification.create({
      user: memberUserId,
      message,
      isRead: false,
    });

    return res.status(200).json({ message: 'Da tu choi yeu cau tham gia' });
  } catch (error) {
    console.error('rejectOrganizationMember error:', error);
    return res.status(500).json({ message: 'Loi server khi tu choi thanh vien' });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const orgId = String(req.params?.orgId || '').trim();

    if (!orgId) {
      return res.status(400).json({ message: 'Thieu thong tin orgId' });
    }

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    // const myRole = getMyRoleInOrganization(organization, String(currentUser._id));
    // if (myRole !== 'admin') {
    //   return res.status(403).json({ message: 'Ban khong co quyen cap nhat to chuc' });
    // }

    const name = String(req.body?.name || '').trim();
    const shortName = String(req.body?.shortName || '').trim();
    const description = String(req.body?.description || '').trim();
    const address = String(req.body?.address || '').trim();
    const website = String(req.body?.website || '').trim();
    const contactEmail = String(req.body?.contactEmail || '').trim();
    const contactPhone = String(req.body?.contactPhone || '').trim();
    const schoolLevelRaw = Number(req.body?.schoolLevel);
    const allowJoinByInviteWithoutApproval = Boolean(req.body?.allowJoinByInviteWithoutApproval);
    const defaultJoinRole = String(req.body?.defaultJoinRole || '').trim().toLowerCase();

    if (!name) {
      return res.status(400).json({ message: 'Ten to chuc la bat buoc' });
    }

    if (!Number.isNaN(schoolLevelRaw) && ![1, 2, 3].includes(schoolLevelRaw)) {
      return res.status(400).json({ message: 'Vui long chon cap truong hop le' });
    }

    if (allowJoinByInviteWithoutApproval) {
      if (!defaultJoinRole || !allowedOrgRoles.has(defaultJoinRole)) {
        return res.status(400).json({ message: 'Vui long chon quyen mac dinh hop le' });
      }
      organization.defaultJoinRole = defaultJoinRole as any;
    }

    organization.name = name;
    organization.shortName = shortName;
    organization.description = description;
    organization.address = address;
    organization.website = website;
    organization.contactEmail = contactEmail;
    organization.contactPhone = contactPhone;
    if (!Number.isNaN(schoolLevelRaw)) {
      organization.schoolLevel = schoolLevelRaw as any;
    }
    organization.allowJoinByInviteWithoutApproval = allowJoinByInviteWithoutApproval;

    await organization.save();

    return res.status(200).json({
      _id: organization._id,
      name: organization.name,
      shortName: organization.shortName,
      description: organization.description,
      address: organization.address,
      website: organization.website,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      schoolLevel: organization.schoolLevel,
      allowJoinByInviteWithoutApproval: organization.allowJoinByInviteWithoutApproval,
      defaultJoinRole: organization.defaultJoinRole || 'student',
      inviteCode: organization.inviteCode,
    });
  } catch (error) {
    console.error('updateOrganization error:', error);
    return res.status(500).json({ message: 'Loi server khi cap nhat to chuc' });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const orgId = String(req.params?.orgId || '').trim();

    if (!orgId) {
      return res.status(400).json({ message: 'Thieu thong tin orgId' });
    }

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const canDelete = (organization.members || []).some(
      (member: any) =>
        String(member.user) === String(currentUser._id)
        && member.status === 'approved'
        // && member.role === 'admin'
    );

    if (!canDelete) {
      return res.status(403).json({ message: 'Ban khong co quyen xoa to chuc' });
    }

    await Promise.all([
      Class.deleteMany({ organization: orgId }),
      Student.deleteMany({ organization: orgId }),
      Teacher.deleteMany({ organization: orgId }),
      Role.deleteMany({ organization: orgId }),
      RecordForm.deleteMany({ organization: orgId }),
      ResponseModel.deleteMany({ organization: orgId }),
      SocialMessage.deleteMany({ organization: orgId }),
    ]);

    await Organization.findByIdAndDelete(orgId);

    return res.status(200).json({ message: 'Xoa to chuc thanh cong' });
  } catch (error) {
    console.error('deleteOrganization error:', error);
    return res.status(500).json({ message: 'Loi server khi xoa to chuc' });
  }
};
