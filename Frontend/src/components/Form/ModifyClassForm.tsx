/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Form, Input, Select, Button, Modal, message } from "antd";
import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import { useAppContext } from "../../context";
import useFetch from "../../hooks/useFetch";

const { Option } = Select;
const SERVER_URL = import.meta.env.VITE_SERVER_URL;

const getGradesBySchoolLevel = (schoolLevel?: number) => {
  switch (schoolLevel) {
    case 1:
      return [1, 2, 3, 4, 5];
    case 2:
      return [6, 7, 8, 9];
    case 3:
      return [10, 11, 12];
    default:
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
};

const getActiveSchoolLevel = () => {
  try {
    const raw = localStorage.getItem("activeOrganization");
    if (!raw) return undefined;
    return JSON.parse(raw)?.schoolLevel;
  } catch {
    return undefined;
  }
};

interface ClassInfo {
  _id: string;
  name: string;
  idClass: string;
  point: number;
}

interface Teacher {
  _id: string;
  idTeacher: string;
  firstName: string;
  lastName: string;
  email: string;
  idClass: ClassInfo;
  createdAt: string;
  updatedAt: string;
}

const ModifyClassForm = () => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  // Lấy state và data từ Context
  const {
    openModifyClassForm,
    setOpenModifyClassForm,
    currentClass, // Chứa: realId, displayId, teacher (tên), grade...
    setReRenderClassTable,
  } = useAppContext();

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const { request, loading } = useFetch();
  const gradeOptions = getGradesBySchoolLevel(getActiveSchoolLevel());

  // 1. Fetch danh sách giáo viên khi mở Modal
  useEffect(() => {
    if (openModifyClassForm) {
      const fetchTeachers = async () => {
        setLoadingTeachers(true);
        try {
          const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
          const res = await request(`${SERVER_URL}/teacher`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${userInfo.token}`,
            },
          });
          if (res) {
            setAllTeachers(res);
          }
        } catch (error) {
          console.error("Lỗi tải danh sách giáo viên:", error);
        } finally {
          setLoadingTeachers(false);
        }
      };
      fetchTeachers();
    }
  }, [openModifyClassForm, request]);

  // 2. Điền dữ liệu hiện tại vào Form
  useEffect(() => {
    if (openModifyClassForm && currentClass && allTeachers.length > 0) {
      form.setFieldsValue({
        grade: currentClass.grade,
        classCode: currentClass.displayId, // Ví dụ: "6A"
        homeroomTeacher: currentClass.idTeacher || "", // Lấy ID giáo viên
      });
    }
  }, [openModifyClassForm, currentClass, allTeachers, form]);

  // 3. Xử lý Submit
  const onFinish = async (values: {
    grade: any;
    classCode: any;
    homeroomTeacher: any;
  }) => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");

    // Chuẩn bị payload
    const payload = {
      grade: values.grade,
      idClass: values.classCode, // Mã lớp (VD: 6A)
      name: `Lớp ${values.classCode}`, // Tên hiển thị (VD: Lớp 6A)
      idNewTeacher: values.homeroomTeacher, // ID giáo viên (ObjectId)
      idOldTeacher: currentClass?.idTeacher || "", // ID giáo viên cũ (ObjectId)
    };

    // Gọi API PATCH vào realId
    const res = await request(`${SERVER_URL}/class/${currentClass?.realId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userInfo.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res && res.status === 409) {
      messageApi.error("Mã lớp đã tồn tại");
      return;
    }

    if (res) {
      messageApi.success("Cập nhật thông tin lớp thành công!");
      handleCancel();
      // Reload lại bảng dữ liệu bên ngoài
      if (setReRenderClassTable) setReRenderClassTable((prev) => !prev);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setOpenModifyClassForm(false);
  };

  return (
    <Modal
      title={
        <div
          className="flex items-center gap-2"
          style={{ color: "var(--primary-color)" }}
        >
          <EditOutlined /> <span>Chỉnh sửa thông tin lớp học</span>
        </div>
      }
      open={openModifyClassForm}
      onCancel={handleCancel}
      footer={null}
      centered
      width={600}
    >
      {contextHolder}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        size="large"
        className="mt-5"
      >
        {/* 1. Khối */}
        <Form.Item
          label="Khối"
          name="grade"
          rules={[{ required: true, message: "Vui lòng chọn khối!" }]}
        >
          <Select placeholder="Chọn khối">
            {gradeOptions.map((g) => (
              <Option key={g} value={g}>
                Khối {g}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 2. Mã lớp */}
        <Form.Item
          label="Mã lớp"
          name="classCode"
          rules={[{ required: true, message: "Vui lòng nhập mã lớp!" }]}
        >
          <Input placeholder="VD: 6A" />
        </Form.Item>

        {/* 3. Giáo viên chủ nhiệm */}
        <Form.Item
          label="Giáo viên chủ nhiệm"
          name="homeroomTeacher"
          rules={[{ required: true, message: "Vui lòng chọn giáo viên!" }]}
        >
          <Select
            placeholder={loadingTeachers ? "Đang tải..." : "Chọn giáo viên"}
            showSearch
            loading={loadingTeachers}
            optionFilterProp="children"
            filterOption={(input, option) =>
              ((option?.label ?? "") as string)
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          >
            {allTeachers.map((t) => (
              <Option
                key={t._id}
                value={t._id}
                label={`${t.lastName} ${t.firstName}`} // Để hỗ trợ search
              >
                {t.lastName} {t.firstName}
                {/* Hiển thị thêm nếu đang chủ nhiệm lớp khác để Admin biết */}
                {t.idClass && t.idClass._id !== currentClass?.realId && (
                  <span className="ml-2 text-xs text-gray-400">
                    (Đang Chủ nhiệm{" "}
                    {typeof t.idClass === "object" ? t.idClass.name : "khác"})
                  </span>
                )}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Buttons */}
        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button size="large" onClick={handleCancel}>
            Hủy bỏ
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={loading}
            icon={<SaveOutlined />}
            style={{ backgroundColor: "var(--primary-color)" }}
          >
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default ModifyClassForm;
