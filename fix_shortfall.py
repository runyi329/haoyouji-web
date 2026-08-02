path = 'client/src/pages/AfFeeDetail.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = (
    "                            const finShortfall = finPendingFee > 0 && (finWalletBal === null || finWalletBal < finPendingFee);\n"
    "                            const walBal = finWalletBal !== null ? finWalletBal : 0;\n"
    "                            const shortfallAmt = finShortfall ? (finPendingFee - walBal) : 0;"
)

new = (
    "                            // finPendingFee 负数=还欠，正数=多付；缺口在还欠时触发\n"
    "                            const walBal = finWalletBal !== null ? finWalletBal : 0;\n"
    "                            const pendingAbs = Math.abs(finPendingFee);\n"
    "                            const finShortfall = finPendingFee < 0 && (finWalletBal === null || walBal < pendingAbs);\n"
    "                            const shortfallAmt = finShortfall ? (pendingAbs - walBal) : 0;"
)

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("替换成功")
else:
    print("未找到目标文本，请检查")
    # 打印附近内容帮助调试
    idx = content.find("finShortfall = finPendingFee")
    if idx >= 0:
        print(repr(content[idx-100:idx+200]))
