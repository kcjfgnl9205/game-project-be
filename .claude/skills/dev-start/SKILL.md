---
name: dev-start
description: 개발 시작 의식. 가장 최근 작업 일지와 git 상태를 확인하고 오늘 할 일을 정리한 뒤 오늘자 일지 파일의 계획 섹션을 만든다. "개발 시작", "오늘 개발 시작", "dev start" 같은 요청에 사용.
disable-model-invocation: true
allowed-tools: Read Write Edit Bash(git *) Bash(ls *) Bash(cat *) Bash(date *)
---

# 개발 시작 (Dev Start)

## 가장 최근 작업 일지

```!
prev=$(ls -1 docs/daily-logs/*.md 2>/dev/null | grep -v "$(date +%F).md" | sort | tail -1)
if [ -n "$prev" ]; then echo "파일: $prev"; echo "---"; cat "$prev"; else echo "(이전 일지 없음 — 첫 작업일이거나 일지 폴더가 비어 있음)"; fi
```

## 현재 git 상태

```!
git log --oneline -10
echo "---"
git status --short
```

## 오늘 날짜

!`date +%F`

## 수행할 작업

1. 위의 가장 최근 일지에서 **"➡️ 내일 할 일"** 섹션과 미완료(체크 안 된) 항목을 찾아 요약한다.
2. 그 일지의 마지막 상태와 현재 git 상태(최근 커밋 / 미커밋 변경)를 대조해서, 어제 어디까지 됐고 무엇이 남았는지 파악한다.
3. 오늘 진행할 작업 목록을 우선순위와 함께 제안하고, 사용자 확인을 받는다.
4. 확인되면 `docs/daily-logs/{오늘날짜}.md` 파일을 만든다(이미 있으면 기존 내용 보존). 아래 양식의 머리말과 **"🎯 오늘 계획"** 섹션만 채우고, 나머지 섹션은 비워 둔다(개발 종료 때 채움).
5. 한국어로 작성한다.

### 일지 양식

```markdown
# {YYYY-MM-DD} 개발 일지

## 🎯 오늘 계획

- [ ] (할 일)

## ✅ 오늘 한 일

## 🚧 막힌 점 / 진행 중

## 📝 메모 / 배운 점

## ➡️ 내일 할 일

## 🔖 커밋 요약
```
