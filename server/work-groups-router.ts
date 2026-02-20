import { Router } from 'express';
import {
  createWorkGroup,
  getUserWorkGroups,
  getWorkGroupById,
  updateWorkGroup,
  archiveWorkGroup,
  getWorkGroupMembers,
  createWorkGroupMember,
  checkWorkGroupPermission,
} from './db-work-groups';

/**
 * 脉动节点工作平台 - 工作群API路由
 */

const router = Router();

// 创建工作群
router.post('/work-groups', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const { name, description, icon } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '工作群名称不能为空' });
    }
    
    const result = await createWorkGroup({
      name: name.trim(),
      description: description?.trim(),
      icon,
      createdBy: userId,
      ownerId: userId,
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('创建工作群失败:', error);
    res.status(500).json({ error: '创建工作群失败' });
  }
});

// 获取用户的所有工作群
router.get('/work-groups', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groups = await getUserWorkGroups(userId);
    
    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('获取工作群列表失败:', error);
    res.status(500).json({ error: '获取工作群列表失败' });
  }
});

// 获取工作群详情
router.get('/work-groups/:id', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groupId = parseInt(req.params.id);
    
    if (isNaN(groupId)) {
      return res.status(400).json({ error: '无效的工作群ID' });
    }
    
    // 检查权限
    const hasPermission = await checkWorkGroupPermission(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ error: '无权访问此工作群' });
    }
    
    const group = await getWorkGroupById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: '工作群不存在' });
    }
    
    res.json({ success: true, data: group });
  } catch (error) {
    console.error('获取工作群详情失败:', error);
    res.status(500).json({ error: '获取工作群详情失败' });
  }
});

// 更新工作群信息
router.put('/work-groups/:id', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groupId = parseInt(req.params.id);
    
    if (isNaN(groupId)) {
      return res.status(400).json({ error: '无效的工作群ID' });
    }
    
    // 检查权限
    const hasPermission = await checkWorkGroupPermission(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ error: '无权修改此工作群' });
    }
    
    const { name, description, icon } = req.body;
    
    const result = await updateWorkGroup(groupId, {
      name: name?.trim(),
      description: description?.trim(),
      icon,
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('更新工作群失败:', error);
    res.status(500).json({ error: '更新工作群失败' });
  }
});

// 删除（归档）工作群
router.delete('/work-groups/:id', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groupId = parseInt(req.params.id);
    
    if (isNaN(groupId)) {
      return res.status(400).json({ error: '无效的工作群ID' });
    }
    
    // 检查权限
    const hasPermission = await checkWorkGroupPermission(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ error: '无权删除此工作群' });
    }
    
    const result = await archiveWorkGroup(groupId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('删除工作群失败:', error);
    res.status(500).json({ error: '删除工作群失败' });
  }
});

// 获取工作群中的所有人员
router.get('/work-groups/:id/members', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groupId = parseInt(req.params.id);
    
    if (isNaN(groupId)) {
      return res.status(400).json({ error: '无效的工作群ID' });
    }
    
    // 检查权限
    const hasPermission = await checkWorkGroupPermission(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ error: '无权访问此工作群' });
    }
    
    const members = await getWorkGroupMembers(groupId);
    
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('获取工作群人员列表失败:', error);
    res.status(500).json({ error: '获取工作群人员列表失败' });
  }
});

// 在工作群中添加人员（创建账本）
router.post('/work-groups/:id/members', async (req, res) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const groupId = parseInt(req.params.id);
    
    if (isNaN(groupId)) {
      return res.status(400).json({ error: '无效的工作群ID' });
    }
    
    // 检查权限
    const hasPermission = await checkWorkGroupPermission(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ error: '无权在此工作群中添加人员' });
    }
    
    const { name, description, icon } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '人员名称不能为空' });
    }
    
    const result = await createWorkGroupMember({
      groupId,
      name: name.trim(),
      description: description?.trim(),
      icon,
      createdBy: userId,
      ownerId: userId,
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('添加工作群人员失败:', error);
    res.status(500).json({ error: '添加工作群人员失败' });
  }
});

export default router;
