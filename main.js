const path = require('path')
const {app, ipcMain} = require('electron')

global.appRoot = path.resolve(__dirname)
// Main browser window.
const manager = require('./src/manager/main')

app.on('ready', () => {
  manager.open()
})
// app.on('activate', () => {
//   if(!browser.isOpen()) browser.open()
// })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('echo', (event, arg) => {
  console.log(arg)
})
