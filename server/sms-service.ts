import tencentcloud from 'tencentcloud-sdk-nodejs';

// 从环境变量读取配置
const TENCENT_CLOUD_SECRET_ID = process.env.COS_SECRET_ID || "";
const TENCENT_CLOUD_SECRET_KEY = process.env.COS_SECRET_KEY || "";
const TENCENT_SMS_REGION = process.env.TENCENT_SMS_REGION || "ap-guangzhou";

// 短信服务配置（需要你在腾讯云控制台获取这些值）
const SMS_CONFIG = {
  // 短信应用ID（在腾讯云短信控制台查看）
  appId: process.env.TENCENT_SMS_APP_ID || "",
  
  // 短信签名（需要先创建并审核通过）
  signName: process.env.TENCENT_SMS_SIGN_NAME || "",
  
  // 短信模板ID（需要先创建并审核通过）
  templateId: process.env.TENCENT_SMS_TEMPLATE_ID || "2328724",
  
  // 默认验证码有效期（分钟）
  defaultExpireMinutes: 5,
};

export class SmsService {
  private client: any;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      if (!TENCENT_CLOUD_SECRET_ID || !TENCENT_CLOUD_SECRET_KEY) {
        console.warn('[SMS] 腾讯云API密钥未配置，短信服务不可用');
        return;
      }

      const SmsClient = tencentcloud.sms.v20210111.Client;
      
      this.client = new SmsClient({
        credential: {
          secretId: TENCENT_CLOUD_SECRET_ID,
          secretKey: TENCENT_CLOUD_SECRET_KEY,
        },
        region: TENCENT_SMS_REGION,
        profile: {
          httpProfile: {
            endpoint: "sms.tencentcloudapi.com",
          },
        },
      });

      this.isInitialized = true;
      console.log('[SMS] 短信服务初始化成功');
    } catch (error) {
      console.error('[SMS] 初始化失败:', error);
      this.isInitialized = false;
    }
  }

  /**
   * 检查短信服务状态
   */
  async checkServiceStatus() {
    if (!this.isInitialized) {
      return { available: false, reason: '服务未初始化' };
    }

    try {
      // 尝试查询模板状态
      const params = {
        TemplateIdSet: [parseInt(SMS_CONFIG.templateId)],
        International: 0,
      };

      const response = await this.client.DescribeSmsTemplateList(params);
      
      if (response.TemplateStatusSet && response.TemplateStatusSet.length > 0) {
        const template = response.TemplateStatusSet[0];
        return {
          available: true,
          template: {
            id: template.TemplateId,
            name: template.TemplateName,
            content: template.TemplateContent,
            status: template.StatusCode,
            statusText: this.getStatusText(template.StatusCode),
          },
        };
      } else {
        return { 
          available: false, 
          reason: '模板不存在或未找到',
          details: response 
        };
      }
    } catch (error: any) {
      console.error('[SMS] 服务检查失败:', error);
      
      let reason = '未知错误';
      if (error.code === 'AuthFailure.SecretIdNotFound') {
        reason = 'API密钥无效';
      } else if (error.code === 'UnsupportedOperation') {
        reason = '短信服务未开通';
      } else if (error.code === 'UnsupportedRegion') {
        reason = '区域不支持';
      } else {
        reason = error.message || error.code || 'API调用失败';
      }

      return { available: false, reason };
    }
  }

  /**
   * 获取所有短信模板列表
   */
  async getTemplates() {
    if (!this.isInitialized || !this.client) {
      throw new Error('短信服务未初始化，请检查腾讯云API密钥配置');
    }
    const response = await this.client.DescribeSmsTemplateList({
      International: 0,
      TemplateIdSet: [],
      Limit: 100,
      Offset: 0,
    });
    return (response.TemplateStatusSet || []).map((t: any) => ({
      id: t.TemplateId,
      name: t.TemplateName,
      content: t.TemplateContent,
      status: t.StatusCode,
      statusText: this.getStatusText(t.StatusCode),
      createTime: t.CreateTime,
      reviewReply: t.ReviewReply || '',
    }));
  }

  /**
   * 发送验证码短信
   */
  async sendVerificationCode(phoneNumber: string, code: string, expireMinutes = SMS_CONFIG.defaultExpireMinutes) {
    if (!this.isInitialized) {
      throw new Error('短信服务未初始化');
    }

    if (!SMS_CONFIG.appId) {
      throw new Error('短信应用ID未配置');
    }

    if (!SMS_CONFIG.signName) {
      throw new Error('短信签名未配置');
    }

    const params = {
      SmsSdkAppId: SMS_CONFIG.appId,
      SignName: SMS_CONFIG.signName,
      TemplateId: SMS_CONFIG.templateId,
      PhoneNumberSet: [`+86${phoneNumber}`],
      TemplateParamSet: [code, expireMinutes.toString()],
    };

    try {
      console.log(`[SMS] 发送验证码到 ${phoneNumber}, 验证码: ${code}`);
      
      const response = await this.client.SendSms(params);
      const result = response.SendStatusSet[0];

      if (result.Code === 'Ok') {
        console.log(`[SMS] 发送成功: ${phoneNumber}`);
        return {
          success: true,
          messageId: result.SerialNo,
          phoneNumber,
          code,
        };
      } else {
        console.error(`[SMS] 发送失败: ${result.Code} - ${result.Message}`);
        throw new Error(`短信发送失败: ${result.Message}`);
      }
    } catch (error: any) {
      console.error('[SMS] 发送异常:', error);
      throw new Error(`短信发送异常: ${error.message}`);
    }
  }

  /**
   * 发送自定义短信
   */
  async sendCustomMessage(phoneNumber: string, templateId: string, templateParams: string[]) {
    if (!this.isInitialized) {
      throw new Error('短信服务未初始化');
    }

    const params = {
      SmsSdkAppId: SMS_CONFIG.appId,
      SignName: SMS_CONFIG.signName,
      TemplateId: templateId,
      PhoneNumberSet: [`+86${phoneNumber}`],
      TemplateParamSet: templateParams,
    };

    try {
      const response = await this.client.SendSms(params);
      return response.SendStatusSet[0];
    } catch (error: any) {
      throw new Error(`短信发送失败: ${error.message}`);
    }
  }

  /**
   * 获取状态文本
   */
  private getStatusText(statusCode: number): string {
    switch (statusCode) {
      case 0: return '审核通过';
      case 1: return '审核中';
      case 2: return '审核拒绝';
      default: return '未知状态';
    }
  }

  /**
   * 生成随机验证码
   */
  generateVerificationCode(length = 6): string {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

// 导出单例实例
export const smsService = new SmsService();