"""插入 CSDN 100 题到 index.html QUIZ 数组"""
with open('index.html', 'r', encoding='utf-8') as f:
    src = f.read()
with open('资料/quiz_sources/csdn_combined.js', 'r', encoding='utf-8') as f:
    new_quiz = f.read()

# 找 QUIZ 数组最后一项的标志
needle = "e:'明确职责边界。"
idx = src.find(needle)
print(f'needle found at: {idx}')

if idx == -1:
    print('❌ 找不到 needle')
else:
    end_marker = '];'
    pos_end = src.find(end_marker, idx)
    print(f'end_marker found at: {pos_end}')
    new_src = src[:pos_end] + new_quiz + '\n' + src[pos_end:]
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_src)
    n_old = len(src.splitlines())
    n_new = len(new_src.splitlines())
    print(f'✅ 插入 {len(new_quiz.splitlines())} 题')
    print(f'原文件 {n_old} 行 → 新文件 {n_new} 行 (+{n_new-n_old})')

    # 验证 QUIZ 数组完整
    quiz_start = new_src.find('const QUIZ=[')
    quiz_end = new_src.find('];', quiz_start)
    quiz_body = new_src[quiz_start:quiz_end+2]
    item_count = quiz_body.count("{d:")
    print(f'QUIZ 总题数: {item_count} (期望 152 = 52 + 100)')