import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FeatureNode {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  path: string;
  displayOrder: number;
  description?: string;
  enabled: boolean;
  children?: FeatureNode[];
}

interface FeatureTreeManagerProps {
  familyId: number;
  onClose?: () => void;
}

export function FeatureTreeManager({ familyId, onClose }: FeatureTreeManagerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [checkedNodes, setCheckedNodes] = useState<Map<string, boolean>>(new Map());
  const [indeterminateNodes, setIndeterminateNodes] = useState<Set<string>>(new Set());

  // 获取功能树数据
  const { data: featureTree, isLoading, refetch } = trpc.admin.getFeatureTree.useQuery({ familyId });

  // 同步功能树到数据库
  const syncTreeMutation = trpc.admin.syncFeatureTree.useMutation({
    onSuccess: () => {
      toast.success("功能树同步成功");
      refetch();
    },
    onError: (error) => {
      toast.error(`同步失败：${error.message}`);
    },
  });

  // 批量更新权限
  const updatePermissionsMutation = trpc.admin.batchUpdateFeaturesByPath.useMutation({
    onSuccess: () => {
      toast.success("权限更新成功");
      refetch();
    },
    onError: (error) => {
      toast.error(`更新失败：${error.message}`);
    },
  });

  // 初始化展开状态和勾选状态
  useEffect(() => {
    if (featureTree) {
      // 默认展开所有一级节点
      const rootIds = featureTree.map((node) => node.id);
      setExpandedNodes(new Set(rootIds));

      // 初始化勾选状态
      const checked = new Map<string, boolean>();
      const collectCheckedState = (nodes: FeatureNode[]) => {
        nodes.forEach((node) => {
          checked.set(node.id, node.enabled);
          if (node.children) {
            collectCheckedState(node.children);
          }
        });
      };
      collectCheckedState(featureTree);
      setCheckedNodes(checked);

      // 计算半选状态
      updateIndeterminateState(featureTree, checked);
    }
  }, [featureTree]);

  // 更新半选状态
  const updateIndeterminateState = (nodes: FeatureNode[], checked: Map<string, boolean>) => {
    const indeterminate = new Set<string>();

    const checkIndeterminate = (node: FeatureNode): { allChecked: boolean; someChecked: boolean } => {
      if (!node.children || node.children.length === 0) {
        const isChecked = checked.get(node.id) ?? false;
        return { allChecked: isChecked, someChecked: isChecked };
      }

      const childrenStates = node.children.map((child) => checkIndeterminate(child));
      const allChecked = childrenStates.every((state) => state.allChecked);
      const someChecked = childrenStates.some((state) => state.someChecked || state.allChecked);

      if (someChecked && !allChecked) {
        indeterminate.add(node.id);
      }

      return { allChecked, someChecked };
    };

    nodes.forEach((node) => checkIndeterminate(node));
    setIndeterminateNodes(indeterminate);
  };

  // 切换展开/折叠
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // 切换勾选状态
  // 注意：父子节点独立控制，不再自动级联选择
  const toggleCheck = (node: FeatureNode) => {
    const newChecked = new Map(checkedNodes);
    const currentState = newChecked.get(node.id) ?? false;
    const newState = !currentState;

    // 只更新当前节点，不自动级联子节点
    newChecked.set(node.id, newState);

    // 不再自动更新父节点状态，父子节点独立控制

    setCheckedNodes(newChecked);
    if (featureTree) {
      updateIndeterminateState(featureTree, newChecked);
    }
  };

  // 保存权限设置
  const handleSave = () => {
    const updates: Array<{ path: string; enabled: boolean }> = [];
    checkedNodes.forEach((enabled, nodeId) => {
      // 从featureTree中找到对应的path
      const findPath = (nodes: FeatureNode[]): string | null => {
        for (const node of nodes) {
          if (node.id === nodeId) return node.path;
          if (node.children) {
            const path = findPath(node.children);
            if (path) return path;
          }
        }
        return null;
      };
      const path = featureTree ? findPath(featureTree) : null;
      if (path) {
        updates.push({ path, enabled });
      }
    });

    console.log('[FeatureTreeManager] 保存权限设置:', {
      familyId,
      updatesCount: updates.length,
      updates: updates.slice(0, 10), // 只显示前10条
    });

    updatePermissionsMutation.mutate({ familyId, updates });
  };

  // 渲染树节点
  const renderNode = (node: FeatureNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isChecked = checkedNodes.get(node.id) ?? false;
    const isIndeterminate = indeterminateNodes.has(node.id);

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-md transition-colors"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center hover:bg-accent-foreground/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
          )}

          {/* 复选框 */}
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => toggleCheck(node)}
            className={isIndeterminate ? "data-[state=checked]:bg-primary/50" : ""}
          />

          {/* 功能名称 */}
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm font-medium">{node.name}</span>
            {node.description && (
              <span className="text-xs text-muted-foreground">({node.description})</span>
            )}
          </div>

          {/* 层级标识 */}
          <span className="text-xs text-muted-foreground">L{node.level}</span>
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureTree || featureTree.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 text-muted-foreground">
          <p>功能树尚未初始化</p>
          <p className="text-sm mt-2">点击下方按钮同步功能树到数据库</p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => syncTreeMutation.mutate({ familyId })}
            disabled={syncTreeMutation.isPending}
          >
            {syncTreeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            同步功能树
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 功能树 - 可滚动区域 */}
      <div className="flex-1 overflow-y-auto border rounded-lg p-4 mb-4">
        {featureTree.map((node) => renderNode(node, 0))}
      </div>

      {/* 说明文字 */}
      <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-shrink-0">
        <p>• 父子节点独立控制，可单独勾选或取消</p>
        <p>• 父节点控制功能入口是否可见</p>
        <p>• 子节点控制具体子功能是否启用</p>
        <p>• 父节点关闭时，子节点自动无法访问（即使勾选）</p>
      </div>

      {/* 操作按钮 - 固定在底部 */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 flex-shrink-0 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncTreeMutation.mutate({ familyId })}
          disabled={syncTreeMutation.isPending}
          className="w-full sm:w-auto"
        >
          {syncTreeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          重新同步功能树
        </Button>

        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
              取消
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={updatePermissionsMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            {updatePermissionsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存权限设置
          </Button>
        </div>
      </div>
    </div>
  );
}
