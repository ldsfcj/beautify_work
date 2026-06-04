// miniprogram/app.js
App({
  onLaunch() {
    const envMap = {
      develop: 'mae-dev-xxxx',       // 替换为陈工的真实 dev env ID
      trial: 'mae-staging-xxxx',     // 替换为 staging
      release: 'mae-prod-xxxx',      // 替换为 prod
    };
    const env = envMap[__wxConfig.envVersion] || envMap.develop;
    wx.cloud.init({ env, traceUser: true });
  },
});
