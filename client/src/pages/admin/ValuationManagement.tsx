import { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface ValuationWeight {
  id: number;
  action_type: string;
  action_name: string;
  weight_value: number;
  is_enabled: boolean;
  description: string;
}

export default function ValuationManagement() {
  const [, setLocation] = useLocation();
  const [weights, setWeights] = useState<ValuationWeight[]>([]);
  const [currentValuation, setCurrentValuation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 加载配置
  useEffect(() => {
    fetchWeights();
    fetchCurrentValuation();
  }, []);

  const fetchWeights = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/admin/valuation/weights`);
      const data = await response.json();
      setWeights(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentValuation = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/valuation/current`);
      const data = await response.json();
      setCurrentValuation(data?.total_valuation || 0);
    } catch (error) {
      console.error('加载估值失败:', error);
    }
  };

  const handleWeightChange = (id: number, value: string) => {
    setWeights(weights.map(w => 
      w.id === id ? { ...w, weight_value: parseFloat(value) || 0 } : w
    ));
  };

  const handleToggleEnabled = (id: number) => {
    setWeights(weights.map(w => 
      w.id === id ? { ...w, is_enabled: !w.is_enabled } : w
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`${BASE_URL}/api/admin/valuation/weights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights })
      });
      alert('保存成功！');
      fetchCurrentValuation();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[#800000]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-br from-[#800000] to-[#A80000] text-white px-6 pt-6 pb-8">
        <button
          onClick={() => setLocation('/admin')}
          className="flex items-center space-x-1 text-white/90 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">返回</span>
        </button>
        
        <h1 className="text-2xl font-bold mb-2">市值管理</h1>
        <p className="text-white/90 text-sm">调整用户行为对平台估值的影响权重</p>
      </div>

      {/* 当前估值展示 */}
      <div className="mx-6 -mt-4 bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-2">当前平台估值</div>
          <div className="text-4xl font-bold text-[#800000]">
            ¥{currentValuation.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-2">基于AI实时计算</div>
        </div>
      </div>

      {/* 权重配置列表 */}
      <div className="mx-6 space-y-4">
        {weights.map((weight) => (
          <div key={weight.id} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={weight.is_enabled}
                  onChange={() => handleToggleEnabled(weight.id)}
                  className="w-5 h-5 text-[#800000] rounded focus:ring-[#800000]"
                />
                <div>
                  <div className="font-bold text-gray-900">{weight.action_name}</div>
                  <div className="text-xs text-gray-500">{weight.description}</div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">估值增量：</label>
              <div className="flex items-center space-x-1">
                <span className="text-sm text-gray-600">¥</span>
                <input
                  type="number"
                  value={weight.weight_value}
                  onChange={(e) => handleWeightChange(weight.id, e.target.value)}
                  disabled={!weight.is_enabled}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800000] focus:border-transparent disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-gradient-to-r from-[#800000] to-[#A80000] text-white py-3 rounded-lg font-bold hover:shadow-lg transition-shadow disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>保存中...</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>保存配置</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
