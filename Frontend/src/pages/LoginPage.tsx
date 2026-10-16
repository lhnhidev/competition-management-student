import React, { useState } from "react";
import { Form, Input, Button, Typography, message } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import useFetch from "../hooks/useFetch";
import { useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

const DEMO_PASSWORD = "123456";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "nhi@gmail.com" },
  { role: "Giáo viên", email: "Ntxuyen515@gmail.com" },
  { role: "Học sinh", email: "Nhi155413@gmail.com" },
];

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const { request, error } = useFetch();
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onFinish = async (values: any) => {
    setLoading(true);
    const data = await request(
      `${import.meta.env.VITE_SERVER_URL}/user/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );

    setLoading(false);

    if (data?.token) {
      localStorage.setItem("userInfo", JSON.stringify(data));
      messageApi.success("Đăng nhập thành công!");
      navigate("/home");
    } else {
      messageApi.error(
        data?.message || error || "Đăng nhập thất bại. Vui lòng thử lại.",
      );
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, var(--surface-2) 0%, var(--bg-color) 45%, var(--surface-3) 100%)",
      }}
    >
      {contextHolder}
      
      {/* Main Container */}
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)]">
              <span className="text-2xl font-bold text-white">🎓</span>
            </div>
          </div>
          <Title level={2} className="!mb-2 !text-[var(--text-color)]">
            Quản lý Thi đua
          </Title>
          <Text className="!text-[var(--text-muted)]">
            Hệ thống quản lý cuộc thi học sinh trung học
          </Text>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-8 shadow-lg backdrop-blur-sm">
          <div className="mb-8">
            <Title level={4} className="!mb-1 !text-[var(--text-color)]">
              Chào mừng bạn!
            </Title>
            <Text className="block !text-[var(--text-muted)]">
              Đăng nhập bằng email và mật khẩu của bạn
            </Text>
          </div>

          {/* Demo Accounts */}
          <div className="mb-6 rounded-lg border border-dashed border-[var(--primary-color)] bg-[var(--surface-2)] p-4">
            <Text className="mb-1 block font-semibold !text-[var(--text-color)]">
              Tài khoản demo
            </Text>
            <Text className="mb-3 block text-xs !text-[var(--text-muted)]">
              Mật khẩu chung: <span className="font-semibold">{DEMO_PASSWORD}</span>
              {" · "}Bấm vào tài khoản để tự điền
            </Text>
            <div className="flex flex-col gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() =>
                    form.setFieldsValue({
                      email: account.email,
                      password: DEMO_PASSWORD,
                    })
                  }
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--primary-color)]"
                >
                  <span className="font-semibold text-[var(--primary-color)]">
                    {account.role}
                  </span>
                  <span className="truncate text-[var(--text-color)]">
                    {account.email}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            size="large"
            autoComplete="off"
          >
            {/* Email Field */}
            <Form.Item
              name="email"
              rules={[
                { required: true, message: "Vui lòng nhập Email!" },
                { type: "email", message: "Email không hợp lệ!" },
              ]}
              className="!mb-6"
            >
              <Input
                prefix={
                  <MailOutlined className="mr-2 text-[var(--primary-color)]" />
                }
                placeholder="your@email.com"
                className="rounded-lg border-[var(--border-color)] bg-[var(--surface-2)] px-4 py-2"
              />
            </Form.Item>

            {/* Password Field */}
            <Form.Item
              name="password"
              rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
              className="!mb-2"
            >
              <Input.Password
                prefix={
                  <LockOutlined className="mr-2 text-[var(--primary-color)]" />
                }
                placeholder="Nhập mật khẩu của bạn"
                className="rounded-lg border-[var(--border-color)] bg-[var(--surface-2)] px-4 py-2"
              />
            </Form.Item>

            {/* Forgot Password Link */}
            <div className="mb-6 flex justify-end">
              <a
                href="/forgot-password"
                className="text-sm text-[var(--primary-color)] hover:underline"
              >
                Quên mật khẩu?
              </a>
            </div>

            {/* Login Button */}
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              className="!h-12 !rounded-lg !bg-gradient-to-r !from-[var(--primary-color)] !to-[var(--secondary-color)] !text-base !font-semibold !text-white !shadow-md !transition-all hover:!shadow-lg"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>

            {/* Help Section */}
            <div className="mt-6 border-t border-[var(--border-color)] pt-6 text-center">
              <Text className="block text-sm !text-[var(--text-color)]">
                Chưa có tài khoản?
              </Text>
              <Button type="link" className="mt-1" onClick={() => navigate("/register")}>
                Đăng ký tài khoản mới
              </Button>
            </div>
          </Form>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-xs text-[var(--text-muted)]">
          <p>Dành cho học sinh và giáo viên trung học cơ sở</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
