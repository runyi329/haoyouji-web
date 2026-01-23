import express from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { getDb } from './db';
import { companyReports, contactFieldValues, contactFieldCategories, contacts, users } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { storagePut } from './storage';
import { ENV } from './_core/env';

const router = express.Router();

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持 PDF 文件'));
    }
  },
});

/**
 * DeepSeek 提示词：格式化企业报告
 */
const DEFAULT_COMPANY_REPORT_PROMPT = `你是一位专业的企业信息分析师。请从提供的企查查报告文本中提取关键信息，并按以下 JSON 格式输出：

{
  "basicInfo": {
    "registeredCapital": "注册资本",
    "establishDate": "成立日期",
    "legalRepresentative": "法人代表",
    "businessStatus": "经营状态"
  },
  "businessScope": {
    "mainBusiness": "主营业务",
    "businessScope": "经营范围"
  },
  "financialData": {
    "revenue": "营业收入",
    "profit": "净利润",
    "assets": "总资产"
  },
  "riskInfo": {
    "lawsuits": "诉讼信息",
    "penalties": "行政处罚",
    "abnormalRecords": "经营异常"
  },
  "shareholderInfo": {
    "mainShareholders": [
      {
        "name": "股东姓名",
        "shareholding": "持股比例"
      }
    ]
  }
}

要求：
1. 如果某个字段在报告中没有找到，设置为 "未找到相关信息"
2. 财务数据尽量提取最新年度的数据
3. 风险信息如果没有，设置为 "无"
4. 股东信息只提取前 5 大股东
5. 所有金额数据保留原始格式（如：1000万元）
6. 日期格式统一为 YYYY-MM-DD

请直接返回 JSON 格式，不要添加任何其他说明文字。`;

/**
 * 当前使用的提示词（可通过 API 更新）
 */
let customPrompt = DEFAULT_COMPANY_REPORT_PROMPT;

/**
 * 调用 DeepSeek API 格式化企业报告
 */
async function formatCompanyReport(rawText: string): Promise<string> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: customPrompt,
          },
          {
            role: 'user',
            content: `以下是企查查报告的原始文本：\n\n${rawText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`DeepSeek API 错误: ${result.error?.message || '未知错误'}`);
    }

    const content = result.choices[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek API 返回内容为空');
    }

    // 验证返回的是否是有效的 JSON
    try {
      JSON.parse(content);
      return content;
    } catch (e) {
      throw new Error('DeepSeek API 返回的不是有效的 JSON 格式');
    }
  } catch (error) {
    console.error('格式化企业报告错误:', error);
    throw error;
  }
}

/**
 * POST /api/company-reports/uplo/**
 * 获取所有公司列表（汇总前端用户填写的公司名称）
 */
router.get('/api/company-reports/companies', async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接失败',
      });
    }
    
    // 查询所有联系人的扩展信息，筛选出公司名称
    const result = await db.execute(sql`
      SELECT DISTINCT 
        cfv.value AS companyName,
        c.name AS contactName,
        u.name AS userName,
        cr.id AS reportId,
        cr.updated_at AS reportUpdatedAt
      FROM contact_field_values cfv
      INNER JOIN contact_field_categories cfc ON cfv.categoryId = cfc.id
      INNER JOIN contacts c ON cfv.contactId = c.id
      INNER JOIN users u ON c.parentUserId = u.id
      LEFT JOIN company_reports cr ON cfv.value = cr.company_name
      WHERE cfc.name = '公司名称' AND cfv.value IS NOT NULL AND cfv.value != ''
      ORDER BY cfv.value
    `);
    
    const rows = result[0] as any[];

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('获取公司列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取公司列表失败',
    });
  }
});

/**
 * 获取 DeepSeek 提示词
 */
router.get('/api/company-reports/prompt', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        prompt: customPrompt,
      },
    });
  } catch (error) {
    console.error('获取提示词失败:', error);
    res.status(500).json({
      success: false,
      error: '获取提示词失败',
    });
  }
});

/**
 * 更新 DeepSeek 提示词（暂时存储在内存中，重启后恢复默认值）
 */
router.put('/api/company-reports/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: '提示词不能为空',
      });
    }

    customPrompt = prompt;

    res.json({
      success: true,
      data: {
        prompt: customPrompt,
      },
    });
  } catch (error) {
    console.error('更新提示词失败:', error);
    res.status(500).json({
      success: false,
      error: '更新提示词失败',
    });
  }
});

/**
 * 上传企查查 PDF 报告
 */
router.post('/api/company-reports/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传 PDF 文件',
      });
    }

    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({
        success: false,
        error: '请提供公司名称',
      });
    }

    // @ts-ignore - req.user 由认证中间件注入
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: '未登录',
      });
    }

    // 1. 上传 PDF 文件到 S3
    const fileKey = `company-reports/${Date.now()}-${companyName}.pdf`;
    const { url: fileUrl } = await storagePut(
      fileKey,
      req.file.buffer,
      'application/pdf'
    );

    // 2. 提取 PDF 文本
    const pdfData = await PDFParse(req.file.buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'PDF 文件无法提取文本内容',
      });
    }

    // 3. 调用 DeepSeek API 格式化
    const formattedContent = await formatCompanyReport(rawText);

    // 4. 保存到数据库（如果公司已存在则更新）
    const db = await getDb();
    const existingReport = await db
      .select()
      .from(companyReports)
      .where(eq(companyReports.companyName, companyName))
      .limit(1);

    if (existingReport.length > 0) {
      // 更新现有报告
      await db
        .update(companyReports)
        .set({
          reportFileUrl: fileUrl,
          rawText: rawText,
          formattedContent: formattedContent,
          uploadedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(companyReports.companyName, companyName));
    } else {
      // 插入新报告
      await db.insert(companyReports).values({
        companyName: companyName,
        reportFileUrl: fileUrl,
        rawText: rawText,
        formattedContent: formattedContent,
        uploadedBy: userId,
      });
    }

    res.json({
      success: true,
      data: {
        companyName,
        fileUrl,
        formattedContent: JSON.parse(formattedContent),
      },
    });
  } catch (error) {
    console.error('上传企业报告错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '上传失败',
    });
  }
});

/**
 * GET /api/company-reports/:companyName
 * 获取指定公司的报告
 */
router.get('/api/company-reports/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;

    const db = await getDb();
    const report = await db
      .select()
      .from(companyReports)
      .where(eq(companyReports.companyName, companyName))
      .limit(1);

    if (report.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: {
        ...report[0],
        formattedContent: JSON.parse(report[0].formattedContent),
      },
    });
  } catch (error) {
    console.error('获取企业报告错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取失败',
    });
  }
});

/**
 * GET /api/company-reports
 * 获取所有报告列表
 */
router.get('/api/company-reports', async (req, res) => {
  try {
    const db = await getDb();
    const reports = await db
      .select({
        id: companyReports.id,
        companyName: companyReports.companyName,
        createdAt: companyReports.createdAt,
        updatedAt: companyReports.updatedAt,
      })
      .from(companyReports)
      .orderBy(companyReports.updatedAt);

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    console.error('获取企业报告列表错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取失败',
    });
  }
});

/**
 * DELETE /api/company-reports/:companyName
 * 删除指定公司的报告
 */
router.delete('/api/company-reports/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;

    // @ts-ignore - req.user 由认证中间件注入
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: '未登录',
      });
    }

    const db = await getDb();
    await db
      .delete(companyReports)
      .where(eq(companyReports.companyName, companyName));

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('删除企业报告错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除失败',
    });
  }
});

export default router;
