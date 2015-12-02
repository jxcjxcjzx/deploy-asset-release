#!/usr/bin/env node

var spawn = require('cross-spawn');
var path = require('path');
var fs = require('fs');
var log = require('lac').log;
var lookup = require('look-up');


var pkgPath = lookup('package.json'),
  projectDir = process.cwd(),
  spawnOpts = {stdio: 'inherit'},
  darc, rootDir;


if (pkgPath) {
  projectDir = path.dirname(path.resolve(pkgPath));
  process.chdir(projectDir);
}


darc = safeReadJson('./.darc');
rootDir = darc.rootDir || 'dist';
result = darc.result ? '--result' : '--no-result';

deployAssets();

function deployAssets() {
  title('开始部署静态资源');

  var last, current, entry = {}, diff;

  last = safeReadJson('./da-all.json');
  spawn('da', [rootDir, '--map=da-all.json', result], spawnOpts).on('close', function (code) {
    if (code !== 0) error('DEPLOY_ASSETS_ERROR', '部署静态资源失败');
    current = safeReadJson('./da-all.json');
    diff = diffObject(last, current);

    for (var key in current) {
      if (/\.(js|css)$/.test(key)) {
        entry[key] = current[key].replace(/http:\/\/[^\/]*/, '');
      }
    }

    fs.writeFileSync('./da-entry.json', JSON.stringify(entry, null, 2));
    fs.writeFileSync('./da-diff.json', JSON.stringify(diff, null, 2));

    if (diff.delete.length || diff.update.length || diff.add.length) {
      deployMaps(diff);
    } else {
      warn('此次部署没有任何文件变化\n');
    }
  });
}

function deployMaps(diff) {
  title('开始部署此次静态资源的 MAP 文件');

  var daArgs = [
    'da-all.json', 'da-entry.json', 'da-diff.json',
    '--hash=0', '--rename={name}', '--nins', '--no-map',
    '--overwrite', '--no-diff', '--no-outDir', '--no-outSuccess'
  ];
  spawn('da', daArgs, spawnOpts).on('close', function (code) {
    if (code !== 0) error('DEPLOY_MAPS_ERROR', '部署 MAP 文件失败');

    if (diff.delete.length) {
      log('  **~删除文件：~**');
      outputDiffFiles(diff.delete);
    }
    if (diff.update.length) {
      log('  **~更新文件：~**');
      outputDiffFiles(diff.update);
    }
    if (diff.add.length) {
      log('  **~添加文件：~**');
      outputDiffFiles(diff.add);
    }

    success('\n部署成功\n');
  });
}

function outputDiffFiles(files) {
  files.forEach(function (file) {
    if (file.new && file.old) {
      log('    **%s** ^%s^', file.key, file.new);
    } else if (file.old) {
      log('    **%s** #%s#', file.key, file.old)
    } else if (file.new) {
      log('    **%s** &%s&', file.key, file.new);
    }
  });
}

function title(msg) {
  log('\n**__%s：__**', msg);
}

function success(msg) {
  log('&**%s**&', msg);
}

function warn(msg) {
  log('!**%s**!', msg);
}

function error(key, msg) {
  log('**#%s#**', msg);
  throw new Error(key);
}

function safeReadJson(file, defaultValue) {
  try {
    return JSON.parse(fs.readFileSync(file).toString());
  } catch (e) {
    if (e.code === 'ENOENT') return defaultValue || {};
    throw e;
  }
}

function diffObject(last, current) {
  var key,
    diff = { add: [], update: [], delete: []};

  for (key in last) {
    if (key in current) {
      if (current[key] !== last[key]) {
        diff.update.push({ key: key, new: current[key], old: last[key] });
      }
    } else {
      diff.delete.push({ key: key, old: last[key] });
    }
  }

  for (key in current) {
    if (!(key in last)) {
      diff.add.push({ key: key, new: current[key] });
    }
  }

  return diff;
}
