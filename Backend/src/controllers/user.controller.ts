/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import generateToken from '../utils/generateToken';
import Class from '../models/Class';
import RecordForm from '../models/RecordForm';
import ResponseModel from '../models/Response';
import Organization from '../models/Organization';
import Teacher from '../models/Teacher';
import { getCloudinary } from '../config/cloudinary';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getActiveOrganizationId = (req: Request) => String(req.headers['x-organization-id'] || '').trim();

const toOrganizationRole = (role: string) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'teacher') return 'teacher';
  if (normalized === 'student') return 'student';
  return 'redflag';
};

const toSystemRole = (orgRole: string) => {
  return orgRole === 'redflag' ? 'user' : orgRole;
};

export const index = (req: Request, res: Response) => {
  res.send('User Controller is working!');
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const organization = await Organization.findById(organizationId).select('members').lean();
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const approvedMembers = (organization.members || []).filter((member: any) => member.status === 'approved');
    const memberRoleMap = new Map<string, string>();
    approvedMembers.forEach((member: any) => {
      memberRoleMap.set(String(member.user), String(member.role));
    });

    const memberIds = approvedMembers.map((member: any) => member.user);
    if (memberIds.length === 0) {
      return res.status(200).json([]);
    }

    const users = await User.find({ _id: { $in: memberIds } }).select('-password').lean();

    const scopedUsers = users.map((user: any) => ({
      ...user,
      role: toSystemRole(memberRoleMap.get(String(user._id)) || String(user.role || 'student')),
    }));

    res.status(200).json(scopedUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const currentUser = (req as any).user;
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const currentMember = (organization.members || []).find(
      (member: any) =>
        String(member.user) === String(currentUser?._id) &&
        member.status === 'approved' &&
        member.role === 'admin'
    );

    if (!currentMember) {
      return res.status(403).json({ message: 'Ban khong co quyen them nguoi dung trong to chuc nay' });
    }

    // 1. Lấy thêm trường followingClasses từ body
    const { firstName, lastName, email, password, role, idUser, followingClasses } = req.body;

    // Kiểm tra các trường bắt buộc (followingClasses không bắt buộc nên không check ở đây)
    if (!firstName || !lastName || !email || !password || !role || !idUser) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin bắt buộc!' });
    }

    // Kiểm tra trùng Email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ status: 409, message: 'Email này đã được sử dụng!' });
    }

    // Kiểm tra trùng ID User
    const existingIdUser = await User.findOne({ idUser });
    if (existingIdUser) {
      return res
        .status(409)
        .json({ status: 409, message: `Mã người dùng '${idUser}' đã tồn tại!` });
    }

    // 2. Logic xử lý followingClasses dựa trên Role
    // Nếu là admin thì luôn là mảng rỗng, ngược lại thì lấy dữ liệu gửi lên (hoặc mảng rỗng nếu null/undefined)
    const classesToAssign = role === 'admin' ? [] : followingClasses || [];

    // 3. Tạo user mới
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      idUser,
      followingClasses: classesToAssign, // Thêm trường này vào
    });

    await newUser.save();

    const orgRole = toOrganizationRole(role);
    organization.members.push({
      user: newUser._id as any,
      role: orgRole as any,
      status: 'approved',
      joinedAt: new Date(),
    });
    await organization.save();

    // Loại bỏ password trước khi trả về client
    const userObject = newUser.toObject();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _removedPassword, ...userResponse } = userObject;

    return res.status(201).json({
      success: true,
      message: 'Tạo người dùng thành công',
      data: userResponse,
    });
  } catch (error: any) {
    console.error('Create User Error:', error);
    return res.status(500).json({
      message: 'Lỗi Server khi tạo người dùng',
      error: error.message,
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
  }

  try {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
    }).select('+password');

    let isValidPassword = false;
    if (user) {
      const storedPassword = typeof user.password === 'string' ? user.password : '';
      const looksLikeBcryptHash = storedPassword.startsWith('$2a$')
        || storedPassword.startsWith('$2b$')
        || storedPassword.startsWith('$2y$');

      if (looksLikeBcryptHash) {
        isValidPassword = await bcrypt.compare(password, storedPassword);
      } else {
        isValidPassword = storedPassword === password;
      }
    }

    if (user && isValidPassword) {
      if (user.isEmailVerified === false) {
        return res.status(403).json({ message: 'Tai khoan chua xac thuc email' });
      }

      // Đăng nhập thành công, tạo JWT và gửi về client
      res.json({
        _id: user._id,
        idUser: user.idUser,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        followingClasses: user.followingClasses,
        token: generateToken(user._id.toString()),
      });
    } else {
      res.status(401).json({ message: 'Email hoặc mật khẩu không hợp lệ' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi Server' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const userId = req.params.id;

  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const currentUser = (req as any).user;
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const currentMember = (organization.members || []).find(
      (member: any) =>
        String(member.user) === String(currentUser?._id) &&
        member.status === 'approved' &&
        member.role === 'admin'
    );

    if (!currentMember) {
      return res.status(403).json({ message: 'Ban khong co quyen xoa nguoi dung trong to chuc nay' });
    }

    if (String(organization.owner) === String(userId)) {
      return res.status(400).json({ message: 'Khong the xoa chu so huu cua to chuc' });
    }

    const beforeCount = organization.members.length;
    organization.members = organization.members.filter((member: any) => String(member.user) !== String(userId));

    if (organization.members.length === beforeCount) {
      return res.status(404).json({ message: 'Nguoi dung khong thuoc to chuc nay' });
    }

    await organization.save();

    const leftInOrganizations = await Organization.countDocuments({ 'members.user': userId });
    if (leftInOrganizations === 0) {
      await User.findByIdAndDelete(userId);
    }

    res.status(200).json({ message: 'Xoa nguoi dung khoi to chuc thanh cong' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi Server' });
  }
};

export const modifyUser = async (req: Request, res: Response) => {
  const userId = req.params.id;

  // 1. Lấy thêm followingClasses từ body
  const { firstName, lastName, email, role, idUser, password, followingClasses } = req.body;

  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const currentUser = (req as any).user;
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const currentMember = (organization.members || []).find(
      (member: any) =>
        String(member.user) === String(currentUser?._id) &&
        member.status === 'approved' &&
        member.role === 'admin'
    );

    if (!currentMember) {
      return res.status(403).json({ message: 'Ban khong co quyen sua nguoi dung trong to chuc nay' });
    }

    const targetMember = (organization.members || []).find((member: any) => String(member.user) === String(userId));
    if (!targetMember) {
      return res.status(404).json({ message: 'Nguoi dung khong thuoc to chuc nay' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    // --- KIỂM TRA TRÙNG LẶP (Giữ nguyên) ---
    const existingEmailUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingEmailUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng bởi người dùng khác!' });
    }

    const existingIdUser = await User.findOne({ idUser, _id: { $ne: userId } });
    if (existingIdUser) {
      return res
        .status(409)
        .json({ message: `Mã người dùng '${idUser}' đã tồn tại ở người dùng khác!` });
    }

    // --- CẬP NHẬT THÔNG TIN ---
    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email;
    user.role = role;
    user.idUser = idUser;

    // 2. Logic cập nhật Lớp theo dõi (followingClasses)
    if (role === 'admin') {
      // Nếu là Admin thì không cần theo dõi lớp cụ thể -> Reset về rỗng
      user.followingClasses = [];
    } else {
      // Các vai trò khác: Cập nhật theo dữ liệu gửi lên (hoặc rỗng nếu không có)
      user.followingClasses = followingClasses || [];
    }

    // 3. Xử lý Mật khẩu (Chỉ cập nhật nếu có gửi lên)
    if (password && password.trim() !== '') {
      user.password = await bcrypt.hash(password, 10);
    }

    // Dùng .save() để kích hoạt middleware validation và hash password (nếu có đổi pass)
    await user.save();

    targetMember.role = toOrganizationRole(role) as any;
    await organization.save();

    // --- TRẢ VỀ RESPONSE ---
    const userObject = user.toObject();

    // Loại bỏ password trước khi trả về
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _removedPassword, ...userResponse } = userObject;

    return res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin người dùng thành công',
      data: userResponse,
    });
  } catch (error) {
    console.error('Modify User Error:', error);
    return res.status(500).json({
      message: 'Lỗi Server khi cập nhật thông tin người dùng',
    });
  }
};

export const getCoDo = async (req: Request, res: Response) => {
  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const organization = await Organization.findById(organizationId).select('members').lean();
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const memberIds = (organization.members || [])
      .filter((member: any) => member.status === 'approved' && member.role === 'redflag')
      .map((member: any) => member.user);

    if (memberIds.length === 0) {
      return res.status(200).json([]);
    }

    const coDoUsers = await User.find({ _id: { $in: memberIds } }).select('-password');
    res.status(200).json(coDoUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const getTrackingReport = async (req: Request, res: Response) => {
  try {
    // 1. Nhận dữ liệu đầu vào
    const { userId, startDate, endDate } = req.body;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ message: 'Thiếu thông tin: userId, startDate, hoặc endDate' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 2. Lấy thông tin User và danh sách lớp đang theo dõi (followingClasses)
    const user = await User.findById(userId)
      .select('-password') // Không lấy password
      .populate('followingClasses') // Populate để lấy thông tin các lớp
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Lấy danh sách ID các lớp mà user này đang theo dõi
    // user.followingClasses lúc này là mảng các object Class do đã populate
    const followingClassesList = (user.followingClasses || []) as any[];

    // GVCN luôn thấy lớp mình chủ nhiệm: tìm hồ sơ Teacher trùng email với User,
    // rồi lấy các lớp có Class.teacher trỏ tới hồ sơ đó (không cần admin gán tay).
    const teacherProfiles = await Teacher.find({ email: String(user.email || '').toLowerCase().trim() })
      .select('_id')
      .lean();
    const homeroomClasses =
      teacherProfiles.length > 0
        ? await Class.find({ teacher: { $in: teacherProfiles.map((t) => t._id) } })
            .select('_id')
            .lean()
        : [];

    const targetClassIds = Array.from(
      new Map(
        [...followingClassesList, ...homeroomClasses].map((c) => [String(c._id), c._id])
      ).values()
    );

    if (targetClassIds.length === 0) {
      return res.status(200).json({
        userInfo: {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        monitoredClasses: [],
      });
    }

    // 3. QUERY SONG SONG (Parallel Execution)
    // Query A: Lấy chi tiết các lớp (kèm Teacher và Students)
    // Query B: Lấy TẤT CẢ phiếu điểm của các lớp này trong khoảng thời gian

    const [classesDetails, recordForms] = await Promise.all([
      Class.find({ _id: { $in: targetClassIds } })
        .populate({
          path: 'teacher',
          select: 'firstName lastName idTeacher email', // Chọn trường cần lấy của Teacher
        })
        .populate({
          path: 'students',
          select: 'firstName lastName idStudent', // Chọn trường cần lấy của Student
        })
        .lean(),

      RecordForm.find({
        class: { $in: targetClassIds }, // Chỉ lấy record thuộc các lớp đang theo dõi
        time: { $gte: start, $lte: end }, // Trong khoảng thời gian (dùng trường 'time' như schema)
      })
        .populate({
          path: 'user', // Người lập phiếu
          select: 'idUser firstName lastName',
        })
        .populate({
          path: 'rule', // Lấy thông tin Rule (Schema là Role nhưng field là rule)
          select: 'point content idRule',
        })
        .sort({ time: -1 }) // Mới nhất lên đầu
        .lean(),
    ]);

    // 4. Xử lý dữ liệu (Mapping & Calculation)

    const processedClasses = classesDetails.map((cls: any) => {
      // A. Lọc ra các RecordForm thuộc về lớp hiện tại
      const classRecords = recordForms.filter(
        (r: any) => r.class.toString() === cls._id.toString()
      );

      // B. Tính tổng điểm của lớp
      // Công thức: 300 + tổng điểm các phiếu
      const totalClassPoint =
        300 +
        classRecords.reduce((sum, r: any) => {
          const point = r.rule ? r.rule.point : 0; // r.rule là bảng Role
          return sum + point;
        }, 0);

      // C. Xử lý danh sách học sinh trong lớp
      const processedStudents = (cls.students || []).map((stu: any) => {
        // Lọc ra các RecordForm thuộc về học sinh này
        const studentRecords = classRecords.filter(
          (r: any) => r.student && r.student.toString() === stu._id.toString()
        );

        // Tính tổng điểm học sinh
        const totalStudentPoint = studentRecords.reduce((sum, r: any) => {
          const point = r.rule ? r.rule.point : 0;
          return sum + point;
        }, 0);

        // Format chi tiết phiếu điểm của học sinh
        const formattedRecords = studentRecords.map((r: any) => ({
          idRecordForm: r.idRecordForm,
          time: r.time, // Thời gian lập
          content: r.rule ? r.rule.content : 'Không có nội dung', // Nội dung từ Rule
          point: r.rule ? r.rule.point : 0,
          creator: r.user
            ? {
                idUser: r.user.idUser,
                firstName: r.user.firstName,
                lastName: r.user.lastName,
              }
            : null,
        }));

        return {
          idStudent: stu.idStudent,
          firstName: stu.firstName,
          lastName: stu.lastName,
          totalPoint: totalStudentPoint,
          records: formattedRecords,
        };
      });

      // D. Format thông tin GVCN
      const homeroomTeacher = cls.teacher
        ? {
            idTeacher: cls.teacher.idTeacher,
            firstName: cls.teacher.firstName,
            lastName: cls.teacher.lastName,
            email: cls.teacher.email,
          }
        : null;

      return {
        idClass: cls.idClass,
        className: cls.name,
        totalClassPoint: totalClassPoint,
        homeroomTeacher: homeroomTeacher,
        students: processedStudents,
      };
    });

    // 5. Trả về kết quả
    return res.status(200).json({
      userInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        email: user.email,
        // Lưu ý: User Schema của bạn không có trường liên kết trực tiếp với Class (như học sinh)
        // nên nếu user là Teacher/Student, cần query thêm bảng tương ứng nếu muốn lấy lớp chủ nhiệm/lớp đang học.
        // Ở đây tôi trả về thông tin cơ bản của User.
      },
      monitoredClasses: processedClasses,
    });
  } catch (error: any) {
    console.error('Error in getTrackingReport:', error);
    return res.status(500).json({ message: 'Lỗi Server', error: error.message });
  }
};

export const trackingRedFlag = async (req: Request, res: Response) => {
  try {
    // 1. Nhận dữ liệu đầu vào
    const { id, startDate, endDate } = req.body;

    // Validate đầu vào
    if (!id || !startDate || !endDate) {
      return res.status(400).json({
        message: 'Thiếu thông tin bắt buộc: id, startDate, endDate',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Kiểm tra tính hợp lệ của ngày
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Định dạng ngày không hợp lệ' });
    }

    // 2. Lấy thông tin User (Cờ đỏ) và danh sách lớp được phân công
    const user = await User.findById(id)
      .select('firstName lastName email followingClasses')
      .populate('followingClasses')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const followingClassesList = (user.followingClasses || []) as any[];
    const targetClassIds = followingClassesList.map((c) => c._id);

    if (targetClassIds.length === 0) {
      return res.status(200).json({
        userInfo: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
        assignedClasses: [],
      });
    }

    // 3. FETCH DỮ LIỆU SONG SONG
    const [classesData, allRecords] = await Promise.all([
      Class.find({ _id: { $in: targetClassIds } })
        .populate({
          path: 'teacher',
          select: 'idTeacher firstName lastName email',
        })
        .populate({
          path: 'students',
          select: 'idStudent firstName lastName',
        })
        .lean(),

      RecordForm.find({
        class: { $in: targetClassIds },
        time: { $gte: start, $lte: end },
      })
        .populate({
          path: 'user',
          select: 'idUser firstName lastName',
        })
        .populate({
          path: 'student',
          select: 'idStudent firstName lastName',
        })
        .populate({
          path: 'rule',
          select: 'idRule content point',
        })
        .sort({ time: -1 })
        .lean(),
    ]);

    // 4. Xử lý logic tính toán và mapping dữ liệu
    const processedClasses = classesData.map((cls: any) => {
      const classIdStr = String(cls._id);

      // Lọc ra tất cả các records thuộc về lớp này trong khoảng thời gian
      const classRecords = allRecords.filter((r: any) => r.class && String(r.class) === classIdStr);

      // --- BƯỚC 1: XỬ LÝ DANH SÁCH HỌC SINH TRƯỚC ---
      const processedStudents = (cls.students || []).map((stu: any) => {
        const studentIdStr = String(stu._id);

        // Lấy các phiếu của học sinh này
        const studentRecords = classRecords.filter(
          (r: any) => r.student && String(r.student._id) === studentIdStr
        );

        // Tính tổng điểm của học sinh (An toàn với rule null)
        const totalStudentPoint = studentRecords.reduce((sum, r: any) => {
          const point = r.rule ? r.rule.point : 0;
          return sum + point;
        }, 0);

        // Map thông tin phiếu điểm chi tiết
        const formattedStudentRecords = studentRecords.map((r: any) => ({
          idRecordForm: r.idRecordForm,
          time: r.time,
          content: r.rule ? r.rule.content : 'Nội dung đã bị xóa',
          point: r.rule ? r.rule.point : 0,
          creator: r.user
            ? {
                idUser: r.user.idUser,
                firstName: r.user.firstName,
                lastName: r.user.lastName,
              }
            : null,
        }));

        return {
          idStudent: stu.idStudent,
          firstName: stu.firstName,
          lastName: stu.lastName,
          totalPoint: totalStudentPoint,
          records: formattedStudentRecords,
        };
      });

      // --- BƯỚC 2: TÍNH TỔNG ĐIỂM LỚP DỰA TRÊN TỔNG ĐIỂM HỌC SINH ---
      // Logic: Cộng tổng điểm của tất cả học sinh lại
      const sumOfStudentPoints = processedStudents.reduce(
        (sum: number, student: any) => sum + student.totalPoint,
        0
      );

      // Logic: Cộng thêm điểm sàn (300)
      const totalClassPoint = 300 + sumOfStudentPoints;

      // --- BƯỚC 3: FORMAT DANH SÁCH RECORD CHUNG CỦA LỚP ---
      const formattedClassRecords = classRecords.map((r: any) => ({
        idRecordForm: r.idRecordForm,
        createdAt: r.time,
        creator: r.user
          ? {
              idUser: r.user.idUser,
              firstName: r.user.firstName,
              lastName: r.user.lastName,
            }
          : null,
        violator: r.student
          ? {
              firstName: r.student.firstName,
              lastName: r.student.lastName,
              idStudent: r.student.idStudent,
            }
          : null,
        violationContent: r.rule
          ? {
              idRule: r.rule.idRule,
              content: r.rule.content,
              point: r.rule.point,
              creator: r.user
                ? {
                    idUser: r.user.idUser,
                    firstName: r.user.firstName,
                    lastName: r.user.lastName,
                  }
                : null,
            }
          : null,
      }));

      // --- TRẢ VỀ OBJECT LỚP ---
      return {
        idClass: cls.idClass,
        className: cls.name,
        totalClassPoint: totalClassPoint, // Đã cập nhật theo công thức mới
        homeroomTeacher: cls.teacher
          ? {
              idTeacher: cls.teacher.idTeacher,
              firstName: cls.teacher.firstName,
              lastName: cls.teacher.lastName,
              email: cls.teacher.email,
            }
          : null,
        students: processedStudents,
        classRecords: formattedClassRecords,
      };
    });

    // 5. Trả về kết quả
    return res.status(200).json({
      userInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      assignedClasses: processedClasses,
    });
  } catch (error: any) {
    console.error('Error in trackingRedFlag:', error);
    return res.status(500).json({ message: 'Lỗi Server', error: error.message });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const organizationId = getActiveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: 'Thieu X-Organization-Id' });
    }

    const organization = await Organization.findById(organizationId).select('members').lean();
    if (!organization) {
      return res.status(404).json({ message: 'Khong tim thay to chuc' });
    }

    const inOrganization = (organization.members || []).some(
      (member: any) => String(member.user) === String(req.params.id) && member.status === 'approved'
    );

    if (!inOrganization) {
      return res.status(404).json({ message: 'Nguoi dung khong thuoc to chuc nay' });
    }

    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('followingClasses');
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi Server' });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;

    if (!currentUser?._id) {
      return res.status(401).json({ message: 'Không xác định được người dùng hiện tại' });
    }

    const user = await User.findById(currentUser._id)
      .select('-password')
      .populate({
        path: 'followingClasses',
        select: 'idClass name point teacher',
      });

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    if (!user.avatarUrl && user.avatar) {
      user.avatarUrl = user.avatar;
      await user.save();
    }

    if (!user.avatar && user.avatarUrl) {
      user.avatar = user.avatarUrl;
      await user.save();
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('Get My Profile Error:', error);
    return res.status(500).json({ message: 'Lỗi Server khi lấy thông tin tài khoản' });
  }
};

export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;

    if (!currentUser?._id) {
      return res.status(401).json({ message: 'Không xác định được người dùng hiện tại' });
    }

    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ họ tên và email' });
    }

    const existedEmail = await User.findOne({
      email,
      _id: { $ne: currentUser._id },
    });

    if (existedEmail) {
      return res.status(409).json({ message: 'Email này đã được sử dụng bởi tài khoản khác' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      currentUser._id,
      {
        firstName,
        lastName,
        email,
      },
      { new: true }
    )
      .select('-password')
      .populate({
        path: 'followingClasses',
        select: 'idClass name point teacher',
      });

    if (!updatedUser) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    return res.status(200).json({
      message: 'Cập nhật thông tin tài khoản thành công',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Update My Profile Error:', error);
    return res.status(500).json({ message: 'Lỗi Server khi cập nhật thông tin tài khoản' });
  }
};

export const changeMyPassword = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;

    if (!currentUser?._id) {
      return res.status(401).json({ message: 'Không xác định được người dùng hiện tại' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = await User.findById(currentUser._id).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    const storedPassword = typeof user.password === 'string' ? user.password : '';
    const looksLikeBcryptHash = storedPassword.startsWith('$2a$')
      || storedPassword.startsWith('$2b$')
      || storedPassword.startsWith('$2y$');

    const isMatched = looksLikeBcryptHash
      ? await bcrypt.compare(String(currentPassword), storedPassword)
      : storedPassword === String(currentPassword);

    if (!isMatched) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác' });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.status(200).json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Change My Password Error:', error);
    return res.status(500).json({ message: 'Lỗi Server khi đổi mật khẩu' });
  }
};

export const getMyActivities = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;

    if (!currentUser?._id) {
      return res.status(401).json({ message: 'Không xác định được người dùng hiện tại' });
    }

    const [recordForms, responses] = await Promise.all([
      RecordForm.find({ user: currentUser._id })
        .sort({ createdAt: -1 })
        .limit(40)
        .populate('class', 'idClass name')
        .populate('student', 'idStudent firstName lastName')
        .populate('rule', 'idRule content point')
        .lean(),
      ResponseModel.find({ idUser: currentUser._id })
        .sort({ createdAt: -1 })
        .limit(40)
        .populate('idRecordForm', 'idRecordForm')
        .lean(),
    ]);

    const recordActivities = recordForms.map((item: any) => ({
      id: item._id,
      type: 'record-form',
      action: 'Tạo phiếu thi đua',
      description: `Phiếu ${item.idRecordForm} - lớp ${item.class?.idClass || '-'} - học sinh ${item.student?.idStudent || '-'}`,
      metadata: {
        idRecordForm: item.idRecordForm,
        className: item.class?.name || '-',
        classId: item.class?.idClass || '-',
        studentName: `${item.student?.lastName || ''} ${item.student?.firstName || ''}`.trim(),
        studentId: item.student?.idStudent || '-',
        ruleContent: item.rule?.content || '-',
        point: item.rule?.point ?? 0,
      },
      createdAt: item.createdAt,
    }));

    const responseActivities = responses.map((item: any) => ({
      id: item._id,
      type: 'response',
      action: 'Gửi phản hồi',
      description: `Phản hồi cho phiếu ${item.recordForm || item.idRecordForm?.idRecordForm || '-'}`,
      metadata: {
        recordForm: item.recordForm || item.idRecordForm?.idRecordForm || '-',
        state: item.state || 'chờ xử lý',
        content: item.content || '',
      },
      createdAt: item.createdAt,
    }));

    const activities = [...recordActivities, ...responseActivities].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return res.status(200).json({
      total: activities.length,
      activities: activities.slice(0, 50),
    });
  } catch (error) {
    console.error('Get My Activities Error:', error);
    return res.status(500).json({ message: 'Lỗi Server khi lấy lịch sử hoạt động' });
  }
};

export const uploadMyAvatar = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;

    if (!currentUser?._id) {
      return res.status(401).json({ message: 'Không xác định được người dùng hiện tại' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn ảnh đại diện để tải lên' });
    }

    const user = await User.findById(currentUser._id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    const cloudinary = getCloudinary();

    const derivePublicIdFromUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        const path = parsed.pathname;
        const marker = '/upload/';
        const markerIndex = path.indexOf(marker);

        if (markerIndex === -1) return '';

        let afterUpload = path.slice(markerIndex + marker.length);
        afterUpload = afterUpload.replace(/^v\d+\//, '');

        return afterUpload.replace(/\.[^.]+$/, '');
      } catch {
        return '';
      }
    };

    const previousPublicId =
      user.avatarPublicId || derivePublicIdFromUrl(user.avatarUrl || user.avatar || '');

    if (previousPublicId) {
      await cloudinary.uploader.destroy(previousPublicId, {
        resource_type: 'image',
      });
    }

    const uploaded = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.CLOUDINARY_AVATAR_FOLDER || 'app-thi-dua/avatars',
          public_id: `user-${user._id}-${Date.now()}`,
          resource_type: 'image',
          overwrite: true,
          transformation: [
            { width: 512, height: 512, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Upload ảnh thất bại'));
            return;
          }

          resolve(result);
        }
      );

      stream.end(req.file?.buffer);
    });

    user.avatar = uploaded.secure_url;
    user.avatarUrl = uploaded.secure_url;
    user.avatarPublicId = uploaded.public_id;

    await user.save();

    return res.status(200).json({
      message: 'Cập nhật ảnh đại diện thành công',
      data: user,
    });
  } catch (error) {
    console.error('Upload My Avatar Error:', error);
    return res.status(500).json({ message: 'Lỗi Server khi upload ảnh đại diện' });
  }
};
