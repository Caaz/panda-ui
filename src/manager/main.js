const {BrowserWindow, Menu} = require('electron')

let win
function open() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true
  })
  win.loadURL('file://' + global.appRoot + '/build/manager.html')
  // The length of this pains me.
  win.setMenu(Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click(item, focusedWindow) {
            if(focusedWindow) focusedWindow.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]))
  win.on('closed', () => {
    win = null
  })
}

function isOpen() {
  return ((typeof win !== 'undefined') && (win !== null))
}
module.exports = {
  open,
  isOpen
}
