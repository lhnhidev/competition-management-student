/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { Card, Avatar, Tag, Button, Tabs, Tooltip, Space } from "antd";
import {
  UserOutlined,
  IdcardOutlined,
  TeamOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import useFetch from "../../hooks/useFetch";
import { Loading } from "../../router";
import { FiEdit, FiTrash2 } from "react-icons/fi";
import { useAppContext } from "../../context";

interface APIClassResponse {
  _id: string;
  name: string;
  idClass: string;
  students: any[];
  teacher: any;
  point: number;
}

interface ClassInfo {
  realId: string;
  displayId: string;
  name: string;
  grade: number;
  teacher: string;
  idTeacher: string;
  studentCount: number;
  logo: string;
}

const ManageClassPage: React.FC = () => {
  const { loading, error, request } = useFetch<APIClassResponse[]>();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");

  const {
    setOpenAddClassForm,
    reRenderClassTable,
    setReRenderClassTable,
    messageApi,
    modal,
    setCurrentClass,
    setOpenModifyClassForm,
  } = useAppContext();

  const handleDelete = async (id: string, displayId: string) => {
    const userInfoString = localStorage.getItem("userInfo");
    const userInfo = userInfoString ? JSON.parse(userInfoString) : null;
    const token = userInfo?.token;

    modal.confirm({
      title: "Xác nhận xóa",
      content: `Bạn có chắc muốn xóa lớp ${displayId}?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk() {
        const deleteStudent = async () => {
          const res = await request(
            `${import.meta.env.VITE_SERVER_URL}/class/${id}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (res && res.status === 404) {
            messageApi.error("Không tìm thấy lớp học.");
            return;
          }

          if (res) {
            messageApi.success("Xóa lớp thành công.");
            setReRenderClassTable((prev) => !prev);
          }
        };

        deleteStudent();
      },
    });
  };

  useEffect(() => {
    const userInfoString = localStorage.getItem("userInfo");
    const userInfo = userInfoString ? JSON.parse(userInfoString) : null;
    const token = userInfo?.token;

    const fetchClasses = async () => {
      const data = await request(`${import.meta.env.VITE_SERVER_URL}/class`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (data) {
        const mappedData: ClassInfo[] = data.map(
          (item: {
            idClass: string;
            teacher: { _id: string; lastName: string; firstName: string };
            _id: any;
            name: any;
            students: string | any[];
          }) => {
            const gradeMatch = item.idClass.match(/\d+/);
            const grade = gradeMatch ? parseInt(gradeMatch[0]) : 0;

            // Xử lý tên giáo viên
            const teacherName = item.teacher
              ? `${item.teacher.lastName} ${item.teacher.firstName}`
              : "Chưa phân công";

            return {
              realId: item._id,
              displayId: item.idClass,
              name: item.name,
              grade: grade,
              teacher: teacherName,
              idTeacher: item.teacher ? item.teacher._id : "",
              studentCount: item.students ? item.students.length : 0,
              logo: `https://ui-avatars.com/api/?name=${item.idClass}&background=random&color=fff&size=128&font-size=0.4`,
            };
          },
        );

        setClasses(mappedData);
      }
    };

    fetchClasses();
  }, [request, reRenderClassTable]);

  const filteredClasses =
    activeTab === "ALL"
      ? classes
      : classes.filter((c) => c.grade.toString() === activeTab);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        Đã có lỗi xảy ra: {error}
      </div>
    );
  }

  const renderClassCard = (cls: ClassInfo) => (
    <Card
      key={cls.realId}
      style={{
        borderColor: "var(--border-color)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
      bodyStyle={{ padding: "0" }}
    >
      <div className="group flex items-center justify-between border-b border-[var(--border-color)] bg-gray-50 bg-opacity-10 p-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={cls.logo}
            size={54}
            shape="square"
            className="rounded-lg border-2 border-white shadow-sm"
          />
          <div>
            <h3 className="m-0 text-lg font-bold text-[var(--text-color)]">
              {cls.name}
            </h3>
            <Tag color="blue" className="mr-0 mt-1 text-[10px]">
              {cls.displayId}
            </Tag>
          </div>
        </div>

        <div className="opacity-0 transition-opacity ease-in-out group-hover:opacity-100">
          <Space size="small">
            <Tooltip title="Chỉnh sửa">
              <Button
                type="text"
                size="small"
                icon={<FiEdit />}
                className="text-blue-600 hover:bg-blue-50"
                onClick={() => {
                  setCurrentClass(cls);
                  setOpenModifyClassForm(true);
                }}
              />
            </Tooltip>
            <Tooltip title="Xóa">
              <Button
                type="text"
                size="small"
                danger
                icon={<FiTrash2 />}
                onClick={() => handleDelete(cls.realId, cls.displayId)}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-[var(--text-color)]">
          <UserOutlined className="text-[var(--primary-color)]" />
          <span className="text-sm font-medium text-gray-500">GVCN:</span>
          <span
            className="max-w-[150px] truncate font-semibold"
            title={cls.teacher}
          >
            {cls.teacher}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[var(--text-color)]">
          <TeamOutlined className="text-[var(--primary-color)]" />
          <span className="text-sm font-medium text-gray-500">Sĩ số:</span>
          <span className="font-semibold">{cls.studentCount} học sinh</span>
        </div>

        <div className="flex items-center gap-2 text-[var(--text-color)]">
          <IdcardOutlined className="text-[var(--primary-color)]" />
          <span className="text-sm font-medium text-gray-500">Mã lớp:</span>
          <span className="rounded bg-gray-100 px-1 font-mono text-gray-600">
            {cls.displayId}
          </span>
        </div>
      </div>
    </Card>
  );

  const items = [
    { key: "ALL", label: "Tất cả" },
    { key: "10", label: "Khối 10" },
    { key: "11", label: "Khối 11" },
    { key: "12", label: "Khối 12" },
    // { key: "9", label: "Khối 9" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-[var(--text-color)]">
            Danh sách lớp học
          </h1>
          <p className="text-gray-500">
            Danh sách các lớp học năm học 2024 - 2025
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          style={{
            backgroundColor: "var(--primary-color)",
            display: window.location.pathname.includes("/dashboard")
              ? "none"
              : "",
          }}
          onClick={() => setOpenAddClassForm(true)}
        >
          Thêm lớp mới
        </Button>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--border-color)] bg-white p-2 px-4 shadow-sm">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          tabBarStyle={{ marginBottom: 0 }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredClasses.map((cls) => renderClassCard(cls))}
      </div>

      {filteredClasses.length === 0 && (
        <div className="py-20 text-center text-gray-400">
          Không tìm thấy lớp học nào.
        </div>
      )}
    </div>
  );
};

export default ManageClassPage;
