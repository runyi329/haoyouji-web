import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
          <Link href="/login">
            <button className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-[#424242]" />
            </button>
          </Link>
          <h1 className="text-lg font-semibold text-[#424242]">隐私条款</h1>
        </div>
      </header>

      {/* 内容区域 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="prose prose-sm max-w-none">
            <p className="text-[#757575] text-sm mb-6">更新日期：2026年1月13日</p>
            <p className="text-[#757575] text-sm mb-8">生效日期：2026年1月13日</p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">引言</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              脉动（以下简称"我们"）深知个人信息对您的重要性，并会尽全力保护您的个人信息安全可靠。我们致力于维持您对我们的信任，恪守以下原则，保护您的个人信息：权责一致原则、目的明确原则、选择同意原则、最少够用原则、确保安全原则、主体参与原则、公开透明原则等。同时，我们承诺，我们将按业界成熟的安全标准，采取相应的安全保护措施来保护您的个人信息。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">一、我们如何收集和使用您的个人信息</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              个人信息是指以电子或者其他方式记录的能够单独或者与其他信息结合识别特定自然人身份或者反映特定自然人活动情况的各种信息。
            </p>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">1.1 注册、登录</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              当您注册、登录脉动及相关服务时，您可以通过手机号创建账号，并且您可以完善相关的网络身份识别信息（头像、昵称、密码），收集这些信息是为了帮助您完成注册。您还可以根据自身需求选择填写性别、生日、地区及个人介绍来完善您的信息。
            </p>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">1.2 信息发布</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              您发布信息、进行评论或互动时，我们将收集您发布的信息，并展示您的昵称、头像、发布内容和信息。
            </p>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">1.3 搜索功能</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              当您使用脉动提供的搜索服务时，我们会收集您的搜索关键字信息、日志记录。为了提供高效的搜索服务，部分前述信息会暂时存储在您的本地存储设备之中。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">二、我们如何使用Cookie和同类技术</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              为确保网站正常运转，我们会在您的计算机或移动设备上存储名为Cookie的小数据文件。Cookie通常包含标识符、站点名称以及一些号码和字符。借助于Cookie，网站能够存储您的偏好等数据。
            </p>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们不会将Cookie用于本政策所述目的之外的任何用途。您可根据自己的偏好管理或删除Cookie。您可以清除计算机上保存的所有Cookie，大部分网络浏览器都设有阻止Cookie的功能。但如果您这么做，则需要在每一次访问我们的网站时亲自更改用户设置。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">三、我们如何共享、转让、公开披露您的个人信息</h2>
            
            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">3.1 共享</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们不会与脉动以外的任何公司、组织和个人分享您的个人信息，但以下情况除外：
            </p>
            <ul className="list-disc list-inside text-[#424242] leading-relaxed mb-4 space-y-2">
              <li>在获取明确同意的情况下共享：获得您的明确同意后，我们会与其他方共享您的个人信息。</li>
              <li>在法定情形下的共享：我们可能会根据法律法规规定、诉讼争议解决需要，或按行政、司法机关依法提出的要求，对外共享您的个人信息。</li>
              <li>与关联公司间共享：为便于我们基于统一的账号体系向您提供一致化服务以及便于您进行统一管理，您的个人信息可能会在我们和我们的关联公司之间共享。</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">3.2 转让</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们不会将您的个人信息转让给任何公司、组织和个人，但以下情况除外：
            </p>
            <ul className="list-disc list-inside text-[#424242] leading-relaxed mb-4 space-y-2">
              <li>在获取明确同意的情况下转让：获得您的明确同意后，我们会向其他方转让您的个人信息。</li>
              <li>在涉及合并、收购或破产清算情形时，如涉及到个人信息转让，我们会要求新的持有您个人信息的公司、组织继续受本政策的约束，否则我们将要求该公司、组织重新向您征求授权同意。</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">3.3 公开披露</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们仅会在以下情况下，公开披露您的个人信息：
            </p>
            <ul className="list-disc list-inside text-[#424242] leading-relaxed mb-4 space-y-2">
              <li>获得您明确同意后。</li>
              <li>基于法律的披露：在法律、法律程序、诉讼或政府主管部门强制性要求的情况下，我们可能会公开披露您的个人信息。</li>
            </ul>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">四、我们如何保护您的个人信息</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们已采取符合业界标准、合理可行的安全防护措施保护您提供的个人信息安全，防止个人信息遭到未经授权访问、公开披露、使用、修改、损坏或丢失。例如，在您的浏览器与服务器之间交换数据时受SSL协议加密保护；我们同时对脉动网站提供HTTPS协议安全浏览方式；我们会使用加密技术提高个人信息的安全性；我们会使用受信赖的保护机制防止个人信息遭到恶意攻击。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">五、您如何管理您的个人信息</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              按照中国相关的法律、法规、标准，以及其他国家、地区的通行做法，我们保障您对自己的个人信息行使以下权利：
            </p>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">5.1 访问您的个人信息</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              您有权访问您的个人信息，法律法规规定的例外情况除外。您可以通过以下方式自行访问您的个人信息：
            </p>
            <ul className="list-disc list-inside text-[#424242] leading-relaxed mb-4 space-y-2">
              <li>账户信息：如果您希望访问或编辑您的账户中的个人资料信息、更改您的密码、添加安全信息等，您可以在个人中心执行此类操作。</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">5.2 更正您的个人信息</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              当您发现我们处理的关于您的个人信息有错误时，您有权要求我们做出更正。您可以通过"5.1访问您的个人信息"中列明的方式提出更正申请。
            </p>

            <h3 className="text-lg font-semibold text-[#424242] mt-6 mb-3">5.3 删除您的个人信息</h3>
            <p className="text-[#424242] leading-relaxed mb-4">
              在以下情形中，您可以向我们提出删除个人信息的请求：
            </p>
            <ul className="list-disc list-inside text-[#424242] leading-relaxed mb-4 space-y-2">
              <li>如果我们处理个人信息的行为违反法律法规。</li>
              <li>如果我们收集、使用您的个人信息，却未征得您的同意。</li>
              <li>如果我们处理个人信息的行为违反了与您的约定。</li>
              <li>如果您不再使用我们的产品或服务，或您注销了账号。</li>
              <li>如果我们不再为您提供产品或服务。</li>
            </ul>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">六、未成年人的个人信息保护</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们非常重视对未成年人个人信息的保护。若您是18周岁以下的未成年人，在使用我们的产品与/或服务前，应事先取得您家长或法定监护人的书面同意。我们根据国家相关法律法规的规定保护未成年人的个人信息。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">七、本政策如何更新</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              我们的隐私政策可能变更。未经您明确同意，我们不会削减您按照本隐私政策所应享有的权利。我们会在本页面上发布对本政策所做的任何变更。
            </p>
            <p className="text-[#424242] leading-relaxed mb-4">
              对于重大变更，我们还会提供更为显著的通知（包括对于某些服务，我们会通过电子邮件发送通知，说明隐私政策的具体变更内容）。
            </p>

            <h2 className="text-xl font-bold text-[#424242] mt-8 mb-4">八、如何联系我们</h2>
            <p className="text-[#424242] leading-relaxed mb-4">
              如果您对本隐私政策有任何疑问、意见或建议，可以通过以下方式与我们联系：
            </p>
            <p className="text-[#424242] leading-relaxed mb-4">
              电子邮件：runyimacau@gmail.com
            </p>
            <p className="text-[#424242] leading-relaxed mb-4">
              一般情况下，我们将在15天内回复。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
