const pngToIco = require('png-to-ico')
const fs = require('fs')
const path = require('path')

const inputPath = path.join(__dirname, 'resources', 'icon.png')
const outputPath = path.join(__dirname, 'resources', 'icon.ico')

console.log('Converting PNG to ICO...')
console.log('Input:', inputPath)
console.log('Output:', outputPath)

// Check if the module has a different export format
const convert = pngToIco.default || pngToIco

convert(inputPath)
  .then(buf => {
    fs.writeFileSync(outputPath, buf)
    console.log('Icon created successfully!')
  })
  .catch(err => {
    console.error('Error creating icon:', err)
    process.exit(1)
  })
