// const {ipcRenderer} = require('electron')
const fs = require('fs')
const $ = require('jquery')
const mkdirp = require('mkdirp')
const request = require('request')
const Anesidora = require('anesidora')
// const Buffer = require('buffer/').Buffer
const {sprintf} = require('sprintf-js')
const ID3Writer = require('browser-id3-writer')
const mm = require('musicmetadata')

const user = {}
let pandoraMain

function updateStations() {
  if(pandoraMain) {
    const stationRow = '<tr data-station-token="%(station.stationToken)s" data-station-name="%(station.stationName)s">' +
      // '<td class="hidden"><i class="fa fa-minus button"></i></td>' +
      '<td><i class="fa fa-play button toggle-scraper"></td>' +
      '<td>%(station.stationName)s</td>' +
      // '<td>0</td>' +
      // '<td>0</td>' +
      // '<td></td>' +
    '</tr>'
    pandoraMain.request('user.getStationList', (err, stationList) => {
      if(err) throw err
      let html = ''
      stationList.stations.forEach(station => {
        html += sprintf(stationRow, {station})
      })
      $('#playlists tbody').append(html)
    })
  }
  else flash('error', 'Called updateStations without logging in')
}
function flash(type, message) {
  const $alert = $('<div class="' + type + '">' + message + '</div>')
  $('#flash').prepend($alert)
  setTimeout(() => {
    $alert.remove()
  }, 5500)
}
function login(succeed, failure) {
  console.log('logging in with ' + [user.email, user.password])
  const pandora = new Anesidora(user.email, user.password)
  pandora.login(err => {
    if(err) failure(err)
    else succeed(pandora)
  })
}
function ready() {
  const queue = new Queue()
  $('#sign-in').click(e => {
    let $target = $(e.target)
    if($target[0].id !== 'sign-in') $target = $target.parent()
    if(!$target.hasClass('disabled')) {
      user.directory = $('#directory').val()
      user.email = $('#email').val()
      user.password = $('#password').val()
      if(!user.email || !user.password || !user.directory) {
        flash('error', 'Invalid Input. Please enter a directory to save to and your Pandora email and password.')
      } else {
        $('#sign-in').addClass('disabled')
        login(pandora => {
          pandoraMain = pandora
          $('#login').remove()
          updateStations()
        }, error => {
          flash('error', error.message)
          $('#sign-in').removeClass('disabled')
        })
      }
    }
  })
  $('#playlists tbody').click(e => {
    const $target = $(e.target)
    if($target.hasClass('toggle-scraper')) {
      const $station = $target.parent().parent()
      if($target.hasClass('fa-play')) {
        const station = $station[0].dataset
        // flash('success', stationToken)
        login(pandora => {
          const scraper = new Scraper(pandora, {
            stationName: station.stationName,
            stationToken: station.stationToken
          }, queue)
          scraper.getPlaylist()
        }, error => {
          flash('error', error.message)
          $target.addClass('fa-stop').removeClass('fa-play')
        })
      } else {
        flash('success', 'stop')
        //
      }
      $target.toggleClass('fa-stop fa-play')
    }
  })
}
function sanitize(input) {
  return input.replace('/', '_')
}
function Queue() {
  this.downloading = false
  this.queue = []
}
Queue.prototype = {
  save(url, location, callback) {
    // console.log('Saving: ' + url)
    const file = fs.createWriteStream(location)
    request(url)
    .pipe(file)
    file.on('close', () => {
      callback()
    })
  },
  readTags(file, callback) {
    const stream = fs.createReadStream(file)
    mm(stream, {duration: true}, (err, metadata) => {
      if (err) throw err
      console.log(metadata)
      stream.close()
      callback(metadata.duration)
    })
  },
  writeTag(art, file, track, callback) {
    const self = this
    const writeTags = () => {
      const songBuffer = fs.readFileSync(file)

      const writer = new ID3Writer(songBuffer)
      writer.setFrame('TIT2', track.songName)
        .setFrame('TPE1', [track.artistName])
        .setFrame('TALB', track.albumName)

      if(fs.existsSync(art)) {
        const coverBuffer = fs.readFileSync(art)
        writer.setFrame('APIC', coverBuffer)
      }

      writer.addTag()
      const taggedSongBuffer = new Buffer(writer.arrayBuffer)
      fs.writeFileSync(file, taggedSongBuffer)
      callback()
    }
    if(fs.existsSync(art) || !track.albumArtUrl) writeTags()
    else {
      self.save(track.albumArtUrl, art, () => {
        const $queueItem = $('div[data-song-identity="' + track.songIdentity + '"] > .album-art')
        $queueItem.html('<img src="' + art.replace('?', '%3F') + '" />')
        writeTags()
      })
    }
  },
  download() {
    const self = this
    const current = this.queue.shift()
    self.downloading = false
    if(current) {
      self.downloading = true
      // console.log(current.track)
      const folder = user.directory +
        sanitize(current.track.artistName) + '/' +
        sanitize(current.track.albumName) + '/'
      const location = folder + sanitize(current.track.songName) + '.mp3'
      mkdirp(folder, err => {
        if(err && console.err(err)) return
        const $queueItem = $('div[data-song-identity="' + current.track.songIdentity + '"]')
        $queueItem.toggleClass('downloading')
        const fileExists = fs.existsSync(location)
        const finish = () => {
          $queueItem.toggleClass('downloading finished')
          setTimeout(() => {
            $queueItem.remove()
          }, 10500)
          self.readTags(location, current.callback)
          self.download()
        }
        if(fileExists) finish()
        else {
          self.save(current.track.additionalAudioUrl, location, () => {
            self.writeTag(folder + 'album-art.jpg', location, current.track, () => {
              finish()
            })
          })
        }
      })
    }
  },
  add(track, station, callback) {
    const info = {track, station, callback}
    this.queue.push(info)
    const queueItem = '<div data-song-identity="%(track.songIdentity)s">' +
      '<div class="album-art"></div>' +
      '<div class="track-info">' +
        '<span>%(track.songName)s</span>' +
        '<span class="small">%(track.artistName)s - %(track.albumName)s</span>' +
        '<span class="small">%(station.stationName)s</span>' +
      '</div>' +
    '</div>'
    $('#queue').append(sprintf(queueItem, info))
    if(!this.downloading) this.download()
  }
}
function currentTime() {
  return ((new Date()).getTime() / 1000)
}
function Scraper(pandora, station, queue) {
  this.pandora = pandora
  this.station = station
  this.waitTime = 0
  this.remaining = 0
  this.queue = queue
  this.startTime = 0
}
Scraper.prototype = {
  getPlaylist() {
    const self = this
    self.startTime = currentTime()
    self.pandora.request('station.getPlaylist', {
      stationToken: self.station.stationToken,
      additionalAudioUrl: 'HTTP_128_MP3'
    }, (error, playlist) => {
      if(error) {
        console.error(error.message)
        flash('error', error.message)
      } else {
        playlist.items.forEach(track => {
          if(!track.adToken) {
            self.remaining++
            this.queue.add(track, self.station, duration => {
              self.complete(duration)
            })
          }
        })
      }
    })
  },
  complete(duration) {
    const self = this
    self.waitTime += duration
    self.remaining--
    if(self.remaining === 0) {
      const timeWaited = (currentTime() - self.startTime)
      self.waitTime -= timeWaited
      self.timer = setTimeout(() => {
        self.getPlaylist()
      }, self.waitTime * 1000)
    }
  }
}

$(ready)
