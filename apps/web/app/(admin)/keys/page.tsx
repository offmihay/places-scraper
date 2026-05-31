'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';

interface ApiKey {
  id: string;
  label: string;
  keyMasked: string;
  dailyQuota: number;
  usedToday: number;
  status: 'active' | 'quota_exhausted' | 'disabled';
  createdAt: string;
}

export default function KeysPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const keys = useQuery({
    queryKey: ['keys'],
    queryFn: () => api.get<ApiKey[]>('/api/keys'),
  });

  const create = useMutation({
    mutationFn: (body: { label: string; key: string; dailyQuota: number }) =>
      api.post('/api/keys', body),
    onSuccess: () => {
      message.success('Key added');
      setAddOpen(false);
      addForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: () => message.error('Could not save key'),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ApiKey> }) =>
      api.patch(`/api/keys/${id}`, body),
    onSuccess: () => {
      message.success('Key updated');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: () => message.error('Update failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/keys/${id}`),
    onSuccess: () => {
      message.success('Key removed');
      void qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: () => message.error('Could not remove'),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          API Keys
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add key
        </Button>
      </div>
      <Table<ApiKey>
        loading={keys.isLoading}
        dataSource={keys.data ?? []}
        rowKey="id"
        size="middle"
        pagination={false}
        columns={[
          { title: 'Label', dataIndex: 'label' },
          {
            title: 'Key',
            dataIndex: 'keyMasked',
            render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
          },
          {
            title: 'Quota usage',
            render: (_, row) => (
              <Space>
                <span>
                  {row.usedToday} / {row.dailyQuota}
                </span>
                <Progress
                  percent={Math.min(100, (row.usedToday / row.dailyQuota) * 100)}
                  size="small"
                  style={{ width: 120 }}
                  showInfo={false}
                />
              </Space>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <Typography.Text>{s}</Typography.Text>,
          },
          {
            title: '',
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(row);
                    editForm.setFieldsValue({
                      label: row.label,
                      dailyQuota: row.dailyQuota,
                      status: row.status,
                    });
                  }}
                />
                <Popconfirm title="Remove this key?" onConfirm={() => remove.mutate(row.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Add API key"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addForm.submit()}
        confirmLoading={create.isPending}
      >
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ dailyQuota: 10000 }}
          onFinish={(v) => create.mutate(v)}
        >
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder="prod-key-1" />
          </Form.Item>
          <Form.Item
            name="key"
            label="Google Places API key"
            rules={[{ required: true, min: 20 }]}
          >
            <Input.Password placeholder="AIzaSy..." />
          </Form.Item>
          <Form.Item name="dailyQuota" label="Daily quota" rules={[{ required: true }]}>
            <InputNumber min={1} max={1_000_000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit API key"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={update.isPending}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => editing && update.mutate({ id: editing.id, body: v })}
        >
          <Form.Item name="label" label="Label">
            <Input />
          </Form.Item>
          <Form.Item name="dailyQuota" label="Daily quota">
            <InputNumber min={1} max={1_000_000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select
              options={[
                { value: 'active', label: 'Active' },
                { value: 'disabled', label: 'Disabled' },
                { value: 'quota_exhausted', label: 'Quota exhausted' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
