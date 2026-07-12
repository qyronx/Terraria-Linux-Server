#!/bin/bash

echo "🚀 빌드 스크립트 시작..."

# unzip 설치 (Render 기본 제공)
apt-get update && apt-get install -y unzip wget

# Mono는 설치하지 않음 - 대신 다른 방법 사용
echo "⚠️ Mono 설치는 생략합니다 (읽기 전용 파일 시스템)"

echo "✅ 빌드 완료!"
