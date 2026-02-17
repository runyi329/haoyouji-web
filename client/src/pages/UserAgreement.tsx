import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function UserAgreement() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
          <Link href="/login">
            <button className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">用户协议</h1>
        </div>
      </header>

      {/* 内容区域 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-500 text-sm mb-6">更新日期：2026年1月13日</p>
            <p className="text-gray-500 text-sm mb-8">生效日期：2026年1月13日</p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">欢迎使用脉动</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              本协议是您与脉动（以下简称"我们"或"脉动"）之间关于您使用脉动服务所订立的协议。请您仔细阅读本协议，特别是免除或者限制责任的条款、法律适用和争议解决条款。免除或者限制责任的条款将以粗体标识，您应重点阅读。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              当您按照注册页面提示填写信息、阅读并同意本协议且完成全部注册程序后，即表示您已充分阅读、理解并接受本协议的全部内容，并与我们达成一致，成为脉动的用户。阅读本协议的过程中，如果您不同意本协议或其中任何条款约定，您应立即停止注册程序。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">一、账号注册与使用</h2>
            
            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">1.1 账号注册</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              您在使用脉动服务前需要注册一个账号。账号应当使用手机号码绑定注册，请您使用尚未与脉动账号绑定的手机号码，以及未被脉动根据本协议封禁的手机号码注册脉动账号。脉动可以根据用户需求或产品需要对账号注册和绑定的方式进行变更，而无须事先通知用户。
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">1.2 账号使用</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              您注册成功后，脉动将给予您一个用户账号及相应的密码，该用户账号和密码由用户负责保管；用户应当对以其用户账号进行的所有活动和事件负法律责任。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              您理解并承诺，您所设置的账号不得违反国家法律法规及脉动的相关规则，您的账号名称、头像和简介等注册信息及其他个人信息中不得出现违法和不良信息，未经他人许可不得用他人名义（包括但不限于冒用他人姓名、名称、字号、头像等足以让人引起混淆的方式）开设账号，不得恶意注册脉动账号（包括但不限于频繁注册、批量注册账号等行为）。您在账号注册及使用过程中需遵守相关法律法规，不得实施任何侵害国家利益、损害其他公民合法权益，有害社会道德风尚的行为。
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">1.3 账号安全</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              您的账号为您自行设置并由您保管，脉动任何时候均不会主动要求您提供您的账号密码。因此，建议您务必保管好您的账号，并确保您在每个上网时段结束时退出登录并以正确步骤离开脉动。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              账号因您主动泄露或因您遭受他人攻击、诈骗等行为导致的损失及后果，脉动并不承担责任，您应通过司法、行政等救济途径向侵权行为人追偿。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">二、用户行为规范</h2>
            
            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">2.1 信息内容规范</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              您在使用脉动服务过程中不得制作、复制、发布、传播含有下列内容的信息：
            </p>
            <ul className="list-disc list-inside text-gray-700 leading-relaxed mb-4 space-y-2">
              <li>反对宪法所确定的基本原则的；</li>
              <li>危害国家安全，泄露国家秘密，颠覆国家政权，破坏国家统一的；</li>
              <li>损害国家荣誉和利益的；</li>
              <li>煽动民族仇恨、民族歧视，破坏民族团结的；</li>
              <li>破坏国家宗教政策，宣扬邪教和封建迷信的；</li>
              <li>散布谣言，扰乱社会秩序，破坏社会稳定的；</li>
              <li>散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；</li>
              <li>侮辱或者诽谤他人，侵害他人合法权益的；</li>
              <li>含有法律、行政法规禁止的其他内容的。</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">2.2 行为规范</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              您在使用脉动服务过程中不得从事下列行为：
            </p>
            <ul className="list-disc list-inside text-gray-700 leading-relaxed mb-4 space-y-2">
              <li>提交、发布虚假信息，或盗用他人头像或资料，冒充、利用他人名义的；</li>
              <li>强制、诱导其他用户关注、点击链接页面或分享信息的；</li>
              <li>虚构事实、隐瞒真相以误导、欺骗他人的；</li>
              <li>利用技术手段批量建立虚假账号的；</li>
              <li>利用脉动账号或本服务从事任何违法犯罪活动的；</li>
              <li>制作、发布与以上行为相关的方法、工具，或对此类方法、工具进行运营或传播，无论这些行为是否为商业目的；</li>
              <li>其他违反法律法规规定、侵犯其他用户合法权益、干扰产品正常运营或脉动未明示授权的行为。</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">三、服务的变更、中断或终止</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              您理解并同意，脉动提供的服务是按照现有技术和条件所能达到的现状提供的。脉动会尽最大努力向您提供服务，确保服务的连贯性和安全性。您理解，脉动不能随时预见和防范技术以及其他风险，包括但不限于不可抗力、病毒、木马、黑客攻击、系统不稳定、第三方服务瑕疵、政府行为等原因可能导致的服务中断、数据丢失以及其他的损失和风险。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              如发生下列任何一种情形，脉动有权随时中断或终止向您提供服务而无需通知您：
            </p>
            <ul className="list-disc list-inside text-gray-700 leading-relaxed mb-4 space-y-2">
              <li>您提供的个人资料不真实；</li>
              <li>您违反本协议中规定的使用规则；</li>
              <li>您在使用收费服务时未按规定向脉动支付相应的服务费；</li>
              <li>未经脉动同意，将脉动平台用于商业目的。</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">四、知识产权</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              脉动在本服务中提供的内容（包括但不限于网页、文字、图片、音频、视频、图表等）的知识产权归脉动所有，用户在使用本服务中所产生的内容的知识产权归用户或相关权利人所有。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              除另有特别声明外，脉动提供本服务时所依托软件的著作权、专利权及其他知识产权均归脉动所有。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              脉动在本服务中所使用的"脉动"、"MAIDONG"等商业标识，其著作权或商标权归脉动所有。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              上述及其他任何本服务包含的内容的知识产权均受到法律保护，未经脉动、用户或相关权利人书面许可，任何人不得以任何形式进行使用或创造相关衍生作品。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">五、免责声明</h2>
            <p className="text-gray-700 leading-relaxed mb-4 font-bold">
              您理解并同意，脉动不对因下述任一情况而导致您的任何损害赔偿承担责任，包括但不限于利润、商誉、使用、数据等方面的损失或其他无形损失的损害赔偿：
            </p>
            <ul className="list-disc list-inside text-gray-700 leading-relaxed mb-4 space-y-2 font-bold">
              <li>使用或未能使用本服务；</li>
              <li>第三方未经批准地使用您的账户或更改您的数据；</li>
              <li>通过本服务购买或获取任何商品、样品、数据、信息或进行交易等行为或替代行为产生的费用及损失；</li>
              <li>您对本服务的误解；</li>
              <li>任何非因脉动的原因而引起的与本服务有关的其他损失。</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">六、协议的变更</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              脉动有权随时对本协议进行修改，并在脉动平台上公示修改后的协议内容，修改后的协议一经公布即有效代替原协议。您可随时查阅最新协议。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              在脉动修改本协议后，如果您不接受修改后的协议，请立即停止使用脉动提供的服务，您继续使用脉动提供的服务将被视为接受修改后的协议。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">七、法律适用与争议解决</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              本协议的订立、执行和解释及争议的解决均应适用中国法律并受中国法院管辖。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              如双方就本协议内容或其执行发生任何争议，双方应尽量友好协商解决；协商不成时，任何一方均可向脉动所在地的人民法院提起诉讼。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">八、其他</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              本协议构成双方对本协议之约定事项及其他有关事宜的完整协议，除本协议规定的之外，未赋予本协议各方其他权利。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              如本协议中的任何条款无论因何种原因完全或部分无效或不具有执行力，本协议的其余条款仍应有效并且有约束力。
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              本协议中的标题仅为方便而设，在解释本协议时应被忽略。
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">九、联系我们</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              如果您对本协议有任何疑问、意见或建议，可以通过以下方式与我们联系：
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              电子邮件：runyimacau@gmail.com
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              一般情况下，我们将在15天内回复。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
