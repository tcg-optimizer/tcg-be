// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'bot/**', 'node_modules/**', 'scripts/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // 1:1 포팅 정책: 원본 JS 정규식을 글자 단위로 보존하므로 불필요 이스케이프 경고를 끈다
      'no-useless-escape': 'off',
    },
  }
);
