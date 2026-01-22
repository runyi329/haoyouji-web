import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Type, BookText, BookMarked } from "lucide-react";
import CharacterManager from "./CharacterManager";
import VocabularyMasterManager from "./VocabularyMasterManager";
import AntonymManager from "./AntonymManager";

export default function MasterLibraryManager() {
  const [activeTab, setActiveTab] = useState<"characters" | "chinese" | "english" | "antonym">("characters");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">总库管理</h2>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="characters" className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            中文字库
          </TabsTrigger>
          <TabsTrigger value="chinese" className="flex items-center gap-2">
            <BookText className="w-4 h-4" />
            中文词库
          </TabsTrigger>
          <TabsTrigger value="english" className="flex items-center gap-2">
            <BookText className="w-4 h-4" />
            英文词库
          </TabsTrigger>
          <TabsTrigger value="antonym" className="flex items-center gap-2">
            <BookMarked className="w-4 h-4" />
            反义词库
          </TabsTrigger>
        </TabsList>

        {/* 中文字库 */}
        <TabsContent value="characters">
          <CharacterManager />
        </TabsContent>

        {/* 中文词库 */}
        <TabsContent value="chinese">
          <VocabularyMasterManager defaultTab="chinese" />
        </TabsContent>

        {/* 英文词库 */}
        <TabsContent value="english">
          <VocabularyMasterManager defaultTab="english" />
        </TabsContent>

        {/* 反义词库 */}
        <TabsContent value="antonym">
          <AntonymManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
