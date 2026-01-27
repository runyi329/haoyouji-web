import { useLocation } from "wouter";
import { Users, Wallet } from "lucide-react";

/**
 * 脉动首页
 * 显示人脉和钱脉两个入口
 */
export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 flex flex-col items-center justify-center p-6">
      {/* 标题 */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">脉动</h1>
        <p className="text-gray-600">连接你的人脉与钱脉</p>
      </div>

      {/* 两个大按钮 */}
      <div className="w-full max-w-md grid grid-cols-2 gap-6">
        {/* 人脉按钮 */}
        <button
          onClick={() => setLocation("/contacts")}
          className="group relative bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 flex flex-col items-center gap-4 border-2 border-transparent hover:border-blue-400"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Users className="w-10 h-10 text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">人脉</h2>
            <p className="text-sm text-gray-500">管理你的联系人</p>
          </div>
        </button>

        {/* 钱脉按钮 */}
        <button
          onClick={() => setLocation("/ledger")}
          className="group relative bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 flex flex-col items-center gap-4 border-2 border-transparent hover:border-green-400"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">钱脉</h2>
            <p className="text-sm text-gray-500">管理你的账本</p>
          </div>
        </button>
      </div>
    </div>
  );
}
