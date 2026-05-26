import { useState, useEffect } from "react";
import { Form, Input, Select, Button, Modal, message, Spin } from "antd";
import { FileAddOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { useAppContext } from "../../context"; // Đảm bảo đường dẫn đúng
import useFetch from "../../hooks/useFetch"; // Đảm bảo đường dẫn đúng

const { Option } = Select;
const SERVER_URL = import.meta.env.VITE_SERVER_URL;

interface ITeacher {
  _id: string;
  idClass?: string | null;
  lastName: string;
  firstName: string;
  idTeacher: string;
}

const AddClassForm = () => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  // State quản lý
  const {
    openAddClassForm,
    setOpenAddClassForm,
    setReRenderClassTable, // Hàm reload bảng lớp học (nếu có trong context)
  } = useAppContext();

  const [availableTeachers, setAvailableTeachers] = useState([]); // List giáo viên chưa chủ nhiệm
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  // Hook fetch data
  const { request, loading } = useFetch();

  // 1. Fetch danh sách giáo viên khi mở Modal
  useEffect(() => {
    if (openAddClassForm) {
      const fetchTeachers = async () => {
        setLoadingTeachers(true);
        try {
          const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
          const res = await request(`${SERVER_URL}/teacher`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userInfo.token}`,
            },
          });

          if (res) {
            // LOGIC QUAN TRỌNG: Lọc giáo viên chưa có idClass (chưa chủ nhiệm)
            // Giả định API trả về mảng teacher, field idClass sẽ null/undefined nếu chưa có lớp

            const freeTeachers = res.filter((t: ITeacher) => !t.idClass);
            setAvailableTeachers(freeTeachers);
          }
        } catch (error) {
          console.error("Lỗi lấy danh sách giáo viên:", error);
        } finally {
          setLoadingTeachers(false);
        }
      };
      fetchTeachers();
    }
  }, [openAddClassForm, request]);

  // 2. Xử lý khi Submit Form
  interface IFormValues {
    classCode: string;
    homeroomTeacher: string;
    grade: number;
  }

  interface IUserInfo {
    token: string;
  }

  interface IClassPayload {
    name: string;
    idClass: string;
    teacher: string;
    point: number;
  }

  const handleAdd = async (values: IFormValues) => {
    const userInfo: IUserInfo = JSON.parse(
      localStorage.getItem("userInfo") || "{}",
    );

    // Chuẩn bị payload khớp với Schema Class của bạn
    const payload: IClassPayload = {
      name: `Lớp ${values.classCode}`, // VD: Lớp 9A1
      idClass: values.classCode, // VD: 9A1
      teacher: values.homeroomTeacher, // ID của giáo viên (ObjectId)
      point: 300, // Điểm mặc định
    };

    const res = await request(`${SERVER_URL}/class`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userInfo.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res && res.status === 409) {
      messageApi.error("Lớp học đã tồn tại.");
      return;
    }

    if (res) {
      messageApi.success(`Thêm ${payload.name} thành công!`);
      handleCancel();
      if (setReRenderClassTable) setReRenderClassTable((prev) => !prev);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setOpenAddClassForm(false);
  };

  return (
    <Modal
      title={
        <div
          className="flex items-center gap-2"
          style={{ color: "var(--primary-color)" }}
        >
          <FileAddOutlined /> <span>Thêm lớp học mới</span>
        </div>
      }
      open={openAddClassForm}
      onCancel={handleCancel}
      footer={null}
      centered
      width={600}
    >
      {contextHolder}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleAdd}
        requiredMark={true}
        size="large"
        className="mt-5"
      >
        {/* Trường 1: Khối (Giữ lại để logic hiển thị hoặc phân loại sau này nếu cần) */}
        <Form.Item
          label={<span className="font-medium text-gray-700">Khối</span>}
          name="grade"
          rules={[{ required: true, message: "Vui lòng chọn khối!" }]}
        >
          <Select placeholder="Chọn khối học">
            {[10, 11, 12].map((grade) => (
              <Option key={grade} value={grade}>
                Khối {grade}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Trường 2: Mã lớp */}
        <Form.Item
          label={
            <span className="font-medium text-gray-700">Mã lớp / Tên lớp</span>
          }
          name="classCode"
          tooltip="Ví dụ: 6A, 9A1..."
          rules={[
            { required: true, message: "Vui lòng nhập mã lớp!" },
            // Validate đơn giản để tránh trùng lặp format
            {
              pattern: /^[0-9]{1,2}[A-Z0-9]+$/,
              message: "Mã lớp không hợp lệ (VD: 6A, 9B1)",
            },
          ]}
        >
          <Input
            placeholder="Nhập tên lớp (VD: 6A)"
            prefix={<FileAddOutlined className="text-gray-400" />}
          />
        </Form.Item>

        {/* Trường 3: Giáo viên chủ nhiệm */}
        <Form.Item
          label={
            <div className="flex w-full justify-between">
              <span className="font-medium text-gray-700">
                Giáo viên chủ nhiệm
              </span>
              {loadingTeachers && <Spin size="small" />}
            </div>
          }
          name="homeroomTeacher"
          rules={[{ required: true, message: "Vui lòng chọn giáo viên!" }]}
          extra="Chỉ hiển thị giáo viên chưa được phân công chủ nhiệm."
        >
          <Select
            placeholder={
              loadingTeachers
                ? "Đang tải danh sách..."
                : "Chọn giáo viên chủ nhiệm"
            }
            showSearch
            optionFilterProp="children"
            loading={loadingTeachers}
            disabled={loadingTeachers}
            notFoundContent="Tất cả giáo viên đều đã có lớp!"
          >
            {availableTeachers.map((t: ITeacher) => (
              <Option key={t._id} value={t._id}>
                <div className="flex items-center gap-2">
                  <UserOutlined />
                  <span>
                    {t.lastName} {t.firstName}
                  </span>
                  <span className="text-xs text-gray-400">({t.idTeacher})</span>
                </div>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Footer Buttons */}
        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button
            size="large"
            onClick={handleCancel}
            className="border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
          >
            Hủy bỏ
          </Button>

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={loading} // Loading khi đang POST tạo lớp
            icon={<PlusOutlined />}
            className="border-none text-white shadow-md"
            style={{
              backgroundColor: "var(--primary-color)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--secondary-color)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--primary-color)")
            }
          >
            Thêm lớp
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default AddClassForm;
