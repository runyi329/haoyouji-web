import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, BookOpen, Calculator, Trash2, Check, Image } from "lucide-react";

export default function WrongQuestions() {
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [gameTypeFilter, setGameTypeFilter] = useState<"all" | "math" | "antonym" | "character">("all");

  const { data: specialKids } = trpc.specialKids.list.useQuery();
  const { data: wrongQuestions, refetch } = trpc.wrongQuestions.list.useQuery(
    {
      kidId: selectedKidId || 0,
      gameType: gameTypeFilter === "all" ? undefined : gameTypeFilter,
    },
    { enabled: !!selectedKidId }
  );
  const { data: stats } = trpc.wrongQuestions.stats.useQuery(
    { kidId: selectedKidId || 0 },
    { enabled: !!selectedKidId }
  );

  const markReviewed = trpc.wrongQuestions.markReviewed.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteQuestion = trpc.wrongQuestions.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // 从 localStorage 读取选择的孩子ID
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
  }, []);

  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  // 解析题目数据
  const parseQuestionData = (questionData: string, gameType: string) => {
    try {
      const data = JSON.parse(questionData);
      if (gameType === "math") {
        return `${data.num1} ${data.operator} ${data.num2} = ?`;
      } else if (gameType === "antonym") {
        return `"${data.word}"的反义词`;
      } else if (gameType === "character") {
        return {
          type: 'character',
          imageUrl: data.imageUrl,
          character: data.character,
          pinyin: data.pinyin,
          category: data.category,
        };
      }
    } catch {
      return "题目数据解析失败";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/games" className="flex items-center gap-2 text-purple-600 mb-4 hover:text-purple-700">
          <ChevronLeft size={20} />
          返回游戏中心
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center">
              <BookOpen className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">错题本</h1>
              <p className="text-sm text-gray-600">复习答错的题目，巩固知识</p>
            </div>
          </div>

          {/* 孩子选择 */}
          {!selectedKidId && specialKids && specialKids.length > 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">请选择要查看错题本的孩子：</p>
              <div className="flex gap-4 justify-center">
                {specialKids.map((kid) => (
                  <Button
                    key={kid.id}
                    onClick={() => setSelectedKidId(kid.id)}
                    className="flex flex-col items-center gap-2 h-auto py-4 px-6"
                  >
                    <div className="text-3xl">{kid.avatar}</div>
                    <span>{kid.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 统计信息 */}
          {selectedKidId && stats && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  {currentKid?.name}的错题统计
                </h2>
                {specialKids && specialKids.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedKidId(null)}
                  >
                    切换孩子
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-3">
                <Card className="p-3 text-center bg-gradient-to-br from-purple-50 to-pink-50 border-0">
                  <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
                  <div className="text-xs text-gray-600">总错题数</div>
                </Card>
                <Card className="p-3 text-center bg-gradient-to-br from-blue-50 to-cyan-50 border-0">
                  <div className="text-2xl font-bold text-blue-600">{stats.math}</div>
                  <div className="text-xs text-gray-600">数学题</div>
                </Card>
                <Card className="p-3 text-center bg-gradient-to-br from-green-50 to-emerald-50 border-0">
                  <div className="text-2xl font-bold text-green-600">{stats.antonym}</div>
                  <div className="text-xs text-gray-600">反义词</div>
                </Card>
                <Card className="p-3 text-center bg-gradient-to-br from-indigo-50 to-purple-50 border-0">
                  <div className="text-2xl font-bold text-indigo-600">{stats.character || 0}</div>
                  <div className="text-xs text-gray-600">看图识字</div>
                </Card>
                <Card className="p-3 text-center bg-gradient-to-br from-orange-50 to-yellow-50 border-0">
                  <div className="text-2xl font-bold text-orange-600">{stats.reviewed}</div>
                  <div className="text-xs text-gray-600">已复习</div>
                </Card>
              </div>
            </div>
          )}

          {/* 筛选按钮 */}
          {selectedKidId && (
            <div className="flex gap-2 mb-6">
              <Button
                variant={gameTypeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameTypeFilter("all")}
              >
                全部
              </Button>
              <Button
                variant={gameTypeFilter === "math" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameTypeFilter("math")}
                className="gap-2"
              >
                <Calculator size={16} />
                数学题
              </Button>
              <Button
                variant={gameTypeFilter === "antonym" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameTypeFilter("antonym")}
                className="gap-2"
              >
                <BookOpen size={16} />
                反义词
              </Button>
              <Button
                variant={gameTypeFilter === "character" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameTypeFilter("character")}
                className="gap-2"
              >
                <Image size={16} />
                看图识字
              </Button>
            </div>
          )}

          {/* 错题列表 */}
          {selectedKidId && wrongQuestions && (
            <div className="space-y-4">
              {wrongQuestions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="text-gray-600">太棒了！还没有错题记录</p>
                  <p className="text-sm text-gray-500 mt-2">继续保持，加油！</p>
                </div>
              ) : (
                wrongQuestions.map((question) => (
                  <Card
                    key={question.id}
                    className={`p-4 ${
                      question.reviewed
                        ? "bg-gray-50 border-gray-200"
                        : "bg-white border-orange-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              question.gameType === "math"
                                ? "bg-blue-100 text-blue-700"
                                : question.gameType === "antonym"
                                ? "bg-green-100 text-green-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {question.gameType === "math" ? "数学题" : question.gameType === "antonym" ? "反义词" : "看图识字"}
                          </span>
                          {question.reviewed && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600">
                              已复习
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(question.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="mb-3">
                          {(() => {
                            const parsed = parseQuestionData(question.questionData, question.gameType);
                            if (typeof parsed === 'object' && parsed.type === 'character') {
                              return (
                                <div>
                                  <div className="flex items-center gap-4 mb-3">
                                    <img
                                      src={parsed.imageUrl}
                                      alt={parsed.character}
                                      className="w-32 h-32 object-cover rounded-lg border-2 border-gray-200"
                                    />
                                    <div>
                                      <div className="text-sm text-gray-600 mb-1">
                                        分类：{parsed.category}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        拼音：{parsed.pinyin}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-600">你的答案：</span>
                                      <span className="text-red-600 font-medium ml-1 text-2xl">
                                        {question.userAnswer}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">正确答案：</span>
                                      <span className="text-green-600 font-medium ml-1 text-2xl">
                                        {question.correctAnswer}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <div>
                                  <div className="text-lg font-semibold text-gray-800 mb-2">
                                    {typeof parsed === 'string' ? parsed : '题目数据解析失败'}
                                  </div>
                                  <div className="flex gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-600">你的答案：</span>
                                      <span className="text-red-600 font-medium ml-1">
                                        {question.userAnswer}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">正确答案：</span>
                                      <span className="text-green-600 font-medium ml-1">
                                        {question.correctAnswer}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!question.reviewed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markReviewed.mutate({ id: question.id })}
                            className="gap-1"
                          >
                            <Check size={14} />
                            已复习
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm("确定要删除这道错题吗？")) {
                              deleteQuestion.mutate({ id: question.id });
                            }
                          }}
                          className="gap-1 text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                          删除
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
