import React from "react";
import { Link, useParams } from "wouter";
import { Share2, Check } from "lucide-react";

const BASE_URL = "https://www.jiangyuchen.cn";

// 文章数据类型定义
interface Article {
  id: number;
  title: string;
  tag?: string;
  content: React.ReactNode;
  posterUrl: string;
}

