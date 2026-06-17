import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
  notification,
} from "antd";
import {
  HomeOutlined,
  LinkOutlined,
  LogoutOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context";

const { Title, Text } = Typography;

type OrgRole = "admin" | "teacher" | "student" | "redflag";
type OrgStatus = "approved" | "pending";

interface OrganizationItem {
  _id: string;
  name: string;
  shortName?: string;
  description?: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  schoolLevel?: 1 | 2 | 3;
  inviteCode: string;
  allowJoinByInviteWithoutApproval: boolean;
  defaultJoinRole?: OrgRole;
  role: OrgRole;
  status: OrgStatus;
  joinedAt?: string;
  isOwner: boolean;
}

const roleLabel: Record<OrgRole, string> = {
  admin: "Quản trị tổ chức",
  teacher: "Giáo viên",
  student: "Học sinh",
  redflag: "Cờ đỏ",
};

const roleColor: Record<OrgRole, string> = {
  admin: "gold",
  teacher: "blue",
  student: "cyan",
  redflag: "magenta",
};

const roleOptions = [
  { value: "student", label: "Học sinh" },
  { value: "teacher", label: "Giáo viên" },
  { value: "redflag", label: "Cờ đỏ" },
  { value: "admin", label: "Quản trị viên" },
] as const;

const goToRoleInterface = (navigate: ReturnType<typeof useNavigate>, role: OrgRole) => {
  if (role === "admin") {
    navigate("/dashboard");
    return;
  }

  if (role === "teacher" || role === "student") {
    navigate("/home-1");
    return;
  }

  navigate("/home-2");
};

const OrganizationHomePage: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const { modal } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingOrganization, setEditingOrganization] = useState<OrganizationItem | null>(null);
  const [isJoinRequestModalOpen, setIsJoinRequestModalOpen] = useState(false);
  const [joinRequestForm] = Form.useForm();
  const [joinRequestInfo, setJoinRequestInfo] = useState<{
    inviteCode: string;
    name: string;
  } | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);

  const userInfo = useMemo(() => {
    const raw = localStorage.getItem("userInfo");
    if (!raw) {
      return {
        fullName: "Người dùng",
        email: "",
        avatarUrl: "",
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const fullName = `${parsed?.lastName || ""} ${parsed?.firstName || ""}`.trim() || "Người dùng";
      return {
        fullName,
        email: parsed?.email || "",
        avatarUrl: parsed?.avatarUrl || parsed?.avatar || "",
      };
    } catch {
      return {
        fullName: "Người dùng",
        email: "",
        avatarUrl: "",
      };
    }
  }, []);

  const token = useMemo(() => {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "";

    try {
      return JSON.parse(raw).token || "";
    } catch {
      return "";
    }
  }, []);

  const fetchOrganizations = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/organizations/my`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(payload.message || "Không tải được danh sách tổ chức");
      }

      setOrganizations(Array.isArray(payload) ? payload : []);
    } catch (error: any) {
      console.error(error);
      messageApi.error(error.message || "Không tải được danh sách tổ chức");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!token) return;

      try {
        const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/notifications/my`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data) || data.length === 0) return;

        data.forEach((item) => {
          notificationApi.open({
            message: "Thông báo",
            description: item.message || "Bạn có thông báo mới",
            placement: "bottomRight",
          });
        });

        await fetch(`${import.meta.env.VITE_SERVER_URL}/notifications/mark-read`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.log("Fetch notifications failed", error);
      }
    };

    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onCreateOrganization = async (values: {
    name: string;
    shortName?: string;
    description?: string;
    address?: string;
    website?: string;
    contactEmail?: string;
    contactPhone?: string;
    allowJoinByInviteWithoutApproval: boolean;
    defaultJoinRole?: OrgRole;
    schoolLevel: 1 | 2 | 3;
  }) => {
    setCreating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Không thể tạo tổ chức");
      }

      messageApi.success("Tạo tổ chức thành công");
      setIsCreateModalOpen(false);
      createForm.resetFields();
      fetchOrganizations();
    } catch (error: any) {
      console.error(error);
      messageApi.error(error.message || "Không thể tạo tổ chức");
    } finally {
      setCreating(false);
    }
  };

  const submitJoinRequest = async (
    code: string,
    values?: { role?: OrgRole; requestMessage?: string },
  ) => {
    setJoining(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/organizations/join/${code}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values || {}),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Không thể tham gia tổ chức");
      }

      messageApi.success(payload.message || "Đã gửi yêu cầu tham gia");
      setJoinCode("");
      fetchOrganizations();
      setIsJoinRequestModalOpen(false);
      joinRequestForm.resetFields();
      setJoinRequestInfo(null);
    } catch (error: any) {
      console.error(error);
      messageApi.error(error.message || "Không thể tham gia tổ chức");
    } finally {
      setJoining(false);
    }
  };

  const onJoinByInviteCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      messageApi.warning("Vui lòng nhập mã mời");
      return;
    }

    setCheckingInvite(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/organizations/invite/${code}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Không tìm thấy tổ chức với mã này");
      }

      if (payload.allowJoinByInviteWithoutApproval) {
        await submitJoinRequest(code);
        return;
      }

      setJoinRequestInfo({ inviteCode: code, name: payload.name || "Tổ chức" });
      setIsJoinRequestModalOpen(true);
      joinRequestForm.resetFields();
    } catch (error: any) {
      console.error(error);
      messageApi.error(error.message || "Không thể kiểm tra mã mời");
    } finally {
      setCheckingInvite(false);
    }
  };

  const openEditOrganization = (organization: OrganizationItem) => {
    setEditingOrganization(organization);
    editForm.setFieldsValue({
      name: organization.name,
      shortName: organization.shortName,
      description: organization.description,
      address: organization.address,
      website: organization.website,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      schoolLevel: organization.schoolLevel ?? 3,
      allowJoinByInviteWithoutApproval: organization.allowJoinByInviteWithoutApproval,
      defaultJoinRole: organization.defaultJoinRole || "student",
    });
    setIsEditModalOpen(true);
  };

  const onUpdateOrganization = async (values: {
    name: string;
    shortName?: string;
    description?: string;
    address?: string;
    website?: string;
    contactEmail?: string;
    contactPhone?: string;
    allowJoinByInviteWithoutApproval: boolean;
    defaultJoinRole?: OrgRole;
    schoolLevel: 1 | 2 | 3;
  }) => {
    if (!editingOrganization) return;

    setCreating(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/organizations/${editingOrganization._id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(values),
        },
      );

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Không thể cập nhật tổ chức");
      }

      messageApi.success("Cập nhật tổ chức thành công");
      setIsEditModalOpen(false);
      setEditingOrganization(null);
      editForm.resetFields();
      fetchOrganizations();
    } catch (error: any) {
      console.error(error);
      messageApi.error(error.message || "Không thể cập nhật tổ chức");
    } finally {
      setCreating(false);
    }
  };

  const onDeleteOrganization = (organization: OrganizationItem) => {
    modal.confirm({
      title: "Xóa tổ chức",
      content: `Bạn có chắc muốn xóa tổ chức ${organization.name}? Hành động này không thể hoàn tác.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      async onOk() {
        setCreating(true);
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SERVER_URL}/organizations/${organization._id}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            },
          );

          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.message || "Không thể xóa tổ chức");
          }

          const rawActiveOrg = localStorage.getItem("activeOrganization");
          if (rawActiveOrg) {
            try {
              const active = JSON.parse(rawActiveOrg);
              if (active?.organizationId === organization._id) {
                localStorage.removeItem("activeOrganization");
              }
            } catch {
              localStorage.removeItem("activeOrganization");
            }
          }

          messageApi.success("Đã xóa tổ chức");
          fetchOrganizations();
        } catch (error: any) {
          console.error(error);
          messageApi.error(error.message || "Không thể xóa tổ chức");
        } finally {
          setCreating(false);
        }
      },
    });
  };

  const openOrganization = (organization: OrganizationItem) => {
    if (organization.status !== "approved") {
      messageApi.info("Tổ chức này đang chờ duyệt thành viên");
      return;
    }

    localStorage.setItem(
      "activeOrganization",
      JSON.stringify({
        organizationId: organization._id,
        organizationName: organization.name,
        role: organization.role,
        schoolLevel: organization.schoolLevel ?? 3,
      }),
    );

    goToRoleInterface(navigate, organization.role);
  };

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color)] p-4 md:p-6">
      {contextHolder}
      {notificationContextHolder}
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space align="center">
              <Avatar size={48} icon={<HomeOutlined />} style={{ backgroundColor: "var(--primary-color)" }} />
              <div>
                <Title level={4} className="!mb-0 !text-[var(--text-color)]">
                  Trang chủ tổ chức
                </Title>
                <Text className="!text-[var(--text-muted)]">
                  Chọn tổ chức để vào không gian làm việc tương ứng của bạn
                </Text>
              </div>
            </Space>

            <Space align="center" className="rounded-xl border border-[var(--border-color)] px-3 py-2">
              <Avatar src={userInfo.avatarUrl} icon={<UserOutlined />} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--text-color)]">{userInfo.fullName}</div>
                <div className="truncate text-xs text-[var(--text-muted)]">{userInfo.email}</div>
              </div>
            </Space>
          </div>

          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setIsCreateModalOpen(true)}>
              Thêm tổ chức
            </Button>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              Đăng xuất
            </Button>
          </Space>
        </div>

        <div className="mb-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-4">
          <Text strong className="!text-[var(--text-color)]">
            Tham gia tổ chức bằng mã mời
          </Text>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <Input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="Nhập mã mời (ví dụ: AB12CD)"
              prefix={<LinkOutlined />}
              maxLength={12}
            />
            <Button
              loading={joining || checkingInvite}
              type="primary"
              onClick={onJoinByInviteCode}
              icon={<TeamOutlined />}
            >
              Tham gia
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="mt-12 flex justify-center">
            <Spin size="large" />
          </div>
        ) : organizations.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-8">
            <Empty description="Bạn chưa tham gia tổ chức nào" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <Card
                key={organization._id}
                className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                styles={{ body: { padding: 18 } }}
                title={<span className="text-[var(--text-color)]">{organization.name}</span>}
                extra={<Tag color={roleColor[organization.role]}>{roleLabel[organization.role]}</Tag>}
              >
                <div className="space-y-2">
                  {organization.shortName && (
                    <Text className="block !text-[var(--text-muted)]">Viết tắt: {organization.shortName}</Text>
                  )}
                  {organization.description && (
                    <Text className="block !text-[var(--text-muted)]">{organization.description}</Text>
                  )}
                  <Text className="block !text-[var(--text-muted)]">Mã mời: {organization.inviteCode}</Text>
                  <Tag color={organization.status === "approved" ? "success" : "warning"}>
                    {organization.status === "approved" ? "Đã tham gia" : "Đang chờ duyệt"}
                  </Tag>
                </div>

                <Space className="mt-3" size="small">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditOrganization(organization)}
                  >
                    Chỉnh sửa
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onDeleteOrganization(organization)}
                  >
                    Xóa
                  </Button>
                </Space>

                <Button
                  type="primary"
                  block
                  className="mt-4"
                  disabled={organization.status !== "approved"}
                  onClick={() => openOrganization(organization)}
                >
                  Vào tổ chức
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={isCreateModalOpen}
        title="Khởi tạo tổ chức trường học"
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="Tạo tổ chức"
        cancelText="Hủy"
      >
        <Form
          layout="vertical"
          form={createForm}
          initialValues={{ allowJoinByInviteWithoutApproval: true, defaultJoinRole: "student", schoolLevel: 3 }}
          onFinish={onCreateOrganization}
        >
          <Form.Item
            name="name"
            label="Tên trường / tổ chức"
            rules={[{ required: true, message: "Vui lòng nhập tên tổ chức" }]}
          >
            <Input placeholder="Ví dụ: Trường THCS Nguyễn Du" />
          </Form.Item>

          <Form.Item name="shortName" label="Tên viết tắt">
            <Input placeholder="Ví dụ: THCS Nguyen Du" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả ngắn">
            <Input.TextArea rows={2} placeholder="Mô tả tổ chức" />
          </Form.Item>

          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="Địa chỉ trường" />
          </Form.Item>

          <Form.Item name="website" label="Website">
            <Input placeholder="https://example.edu.vn" />
          </Form.Item>

          <Form.Item name="contactEmail" label="Email liên hệ">
            <Input placeholder="contact@example.edu.vn" />
          </Form.Item>

          <Form.Item name="contactPhone" label="Số điện thoại liên hệ">
            <Input placeholder="0123 456 789" />
          </Form.Item>

          <Form.Item
            name="schoolLevel"
            label="Loại trường"
            rules={[{ required: true, message: "Vui lòng chọn loại trường" }]}
          >
            <Select
              placeholder="Chọn loại trường"
              options={[
                { value: 1, label: "Cấp 1 (Lớp 1-5)" },
                { value: 2, label: "Cấp 2 (Lớp 6-9)" },
                { value: 3, label: "Cấp 3 (Lớp 10-12)" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="allowJoinByInviteWithoutApproval"
            label="Chính sách tham gia bằng link/mã mời"
            valuePropName="checked"
          >
            <Switch checkedChildren="Tự động duyệt" unCheckedChildren="Cần admin duyệt" />
          </Form.Item>

          <Form.Item shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("allowJoinByInviteWithoutApproval") ? (
                <Form.Item
                  name="defaultJoinRole"
                  label="Quyền mặc định khi tham gia"
                  rules={[{ required: true, message: "Vui lòng chọn quyền mặc định" }]}
                >
                  <Select
                    placeholder="Chọn quyền mặc định"
                    options={roleOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={isEditModalOpen}
        title="Chỉnh sửa thông tin tổ chức"
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingOrganization(null);
        }}
        onOk={() => editForm.submit()}
        confirmLoading={creating}
        okText="Lưu thay đổi"
        cancelText="Hủy"
      >
        <Form layout="vertical" form={editForm} onFinish={onUpdateOrganization}>
          <Form.Item
            name="name"
            label="Tên trường / tổ chức"
            rules={[{ required: true, message: "Vui lòng nhập tên tổ chức" }]}
          >
            <Input placeholder="Ví dụ: Trường THCS Nguyễn Du" />
          </Form.Item>

          <Form.Item name="shortName" label="Tên viết tắt">
            <Input placeholder="Ví dụ: THCS Nguyen Du" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả ngắn">
            <Input.TextArea rows={2} placeholder="Mô tả tổ chức" />
          </Form.Item>

          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="Địa chỉ trường" />
          </Form.Item>

          <Form.Item name="website" label="Website">
            <Input placeholder="https://example.edu.vn" />
          </Form.Item>

          <Form.Item name="contactEmail" label="Email liên hệ">
            <Input placeholder="contact@example.edu.vn" />
          </Form.Item>

          <Form.Item name="contactPhone" label="Số điện thoại liên hệ">
            <Input placeholder="0123 456 789" />
          </Form.Item>

          <Form.Item
            name="schoolLevel"
            label="Loại trường"
            rules={[{ required: true, message: "Vui lòng chọn loại trường" }]}
          >
            <Select
              placeholder="Chọn loại trường"
              options={[
                { value: 1, label: "Cấp 1 (Lớp 1-5)" },
                { value: 2, label: "Cấp 2 (Lớp 6-9)" },
                { value: 3, label: "Cấp 3 (Lớp 10-12)" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="allowJoinByInviteWithoutApproval"
            label="Chính sách tham gia bằng link/mã mời"
            valuePropName="checked"
          >
            <Switch checkedChildren="Tự động duyệt" unCheckedChildren="Cần admin duyệt" />
          </Form.Item>

          <Form.Item shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("allowJoinByInviteWithoutApproval") ? (
                <Form.Item
                  name="defaultJoinRole"
                  label="Quyền mặc định khi tham gia"
                  rules={[{ required: true, message: "Vui lòng chọn quyền mặc định" }]}
                >
                  <Select
                    placeholder="Chọn quyền mặc định"
                    options={roleOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={isJoinRequestModalOpen}
        title={joinRequestInfo ? `Yêu cầu tham gia ${joinRequestInfo.name}` : "Yêu cầu tham gia"}
        onCancel={() => {
          setIsJoinRequestModalOpen(false);
          setJoinRequestInfo(null);
        }}
        onOk={() => joinRequestForm.submit()}
        confirmLoading={joining}
        okText="Gửi yêu cầu"
        cancelText="Hủy"
      >
        <Form
          layout="vertical"
          form={joinRequestForm}
          onFinish={(values) => {
            if (!joinRequestInfo?.inviteCode) return;
            submitJoinRequest(joinRequestInfo.inviteCode, {
              role: values.role,
              requestMessage: values.requestMessage,
            });
          }}
        >
          <Form.Item
            name="role"
            label="Vai trò mong muốn"
            rules={[{ required: true, message: "Vui lòng chọn vai trò" }]}
          >
            <Select
              placeholder="Chọn vai trò"
              options={roleOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="requestMessage"
            label="Nội dung kèm theo"
            rules={[{ required: true, message: "Vui lòng nhập nội dung" }]}
          >
            <Input.TextArea rows={3} placeholder="Ví dụ: Tôi muốn tham gia với vai trò giáo viên..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrganizationHomePage;
