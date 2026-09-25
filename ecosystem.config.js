// pm2 프로세스 설정 (서버: /srv/leak-care). 환경변수는 같은 디렉터리의 .env를 Nest ConfigModule이 읽는다.
module.exports = {
  apps: [
    {
      name: 'leak-care',
      script: 'dist/main.js',
      cwd: '/srv/leak-care',
      instances: 1,
      // 업로드 파일을 메모리에 올리므로 비정상적으로 커지면 재시작한다 (2GB 인스턴스 + 2GB 스왑)
      max_memory_restart: '1500M',
      kill_timeout: 10000,
      time: true,
    },
  ],
};
