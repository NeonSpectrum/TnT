var express = require('express');
var path = require('path');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoClient = require('mongodb').MongoClient;
var bodyParser = require('body-parser');
var session = require('express-session');
var auth = require('./auth')();
var flash = require('./flash')();
var populator = require('./populator');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');
app.use(session({
  secret: '092702454da84936830ba28a975be7b3',
  resave: false,
  saveUninitialized: false
}));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/mods', express.static(path.join(__dirname, 'node_modules/')));
/*
 * MongoDB Connection
 */
var dbPool;
var dbs = mongoClient.connect("mongodb://localhost:27017/tnt_db", function(err, db) {
  if (!err) {
    console.log('MongoDB connection established on localhost:27017');
    dbPool = db;
    var pp = populator(db);
    // pp.resetQuestionnaire(function() {});
    // pp.resetScoreboard(function() {});
    // pp.resetAnswersheet(function() {});
    pp.populateQuestionnaire();
    // pp.populateScoreboard();
  } else {
    console.log("Failed to establish connection to localhost:27017");
  }
});
/*
 * GET Requests
 */
var connectedClients = [];
app.get('/', function(req, res) {
  if (req.session.college === undefined) {
    res.render('login', {
      flash: flash.display(req.session)
    });
  } else {
    res.redirect('/game');
  }
});
app.get('/tnt', function(req, res) {
  res.render('tnt');
});
app.get('/game', function(req, res) {
  if (req.session.college === undefined) {
    res.redirect('/');
  } else {
    res.render('game', {
      college: req.session.college,
      campus: req.session.campus,
      image: req.session.image,
      abbr: req.session.abbr
    });
  }
});
app.get('/quizmaster', function(req, res) {
  res.render('quizmaster');
});
app.get('/viewers', function(req, res) {
  res.render('viewers');
});
app.get('/scoreboard', function(req, res) {
  res.render('scoreboard');
});
app.get('/control_panel', function(req, res) {
  if (req.session.access_permission === undefined) {
    res.render('control_panel/login', {
      flash: flash.display(req.session)
    });
  } else {
    res.render('control_panel/' + req.session.access_page);
  }
});
app.get('/logout', function(req, res) {
  if (req.session.abbr !== undefined) {
    connectedClients.splice(connectedClients.indexOf(req.session.abbr), 1);
  }
  req.session.destroy();
  if (req.query.redirectTo === undefined) {
    res.redirect('/');
  } else {
    res.redirect('/' + req.query.redirectTo);
  }
});
app.get('/extempo', function(req, res) {
  res.render('extempo');
});
/*
 * POST Requests
 */
app.post('/', function(req, res) {
  var college = req.body.college;
  var password = req.body.password;
  var authFlag = false;
  authFlag = auth.verify(college, password);
  if (connectedClients.indexOf(college) === -1) {
    if (!authFlag) {
      req.session.flash_status = 'Failed';
      req.session.flash_message = 'Oops! Login Failed.';
      res.redirect('/');
    } else {
      req.session.college = authFlag.college;
      req.session.campus = authFlag.campus;
      req.session.image = authFlag.image;
      req.session.abbr = authFlag.abbr;
      res.redirect('/game');
    }
  } else {
    req.session.flash_status = 'Failed';
    req.session.flash_message = 'Oops! ' + college + ' has already logged in.';
    res.redirect('/');
  }
});
app.post('/control_panel', function(req, res) {
  var accessCode = req.body.accessCode;
  switch (accessCode) {
    case 'rnd':
      req.session.access_permission = 'Granted';
      req.session.access_page = 'panel_board';
      break;
    case 'rnd1':
      req.session.access_permission = 'Granted';
      req.session.access_page = 'question_manager';
      break;
    default:
      req.session.flash_status = 'Failed';
      req.session.flash_message = 'Oops! Login Failed.';
      break;
  }
  res.redirect('/control_panel');
});
app.post('/question_manager/insert', function(req, res) {
  var question = req.body.question;
  var difficulty = req.body.difficulty;
  var category = req.body.category;
  var correctAnswer = req.body.correctAnswer;
  var optionA = req.body.optionA;
  var optionB = req.body.optionB;
  var optionC = req.body.optionC;
  var optionD = req.body.optionD;
  dbPool.collection('questionnaire').find({
    question: question
  }).toArray(function(err, items) {
    if (!err && items.length === 0) {
      dbPool.collection('questionnaire').insert({
        difficulty: difficulty,
        category: category,
        question: question,
        choice_a: optionA,
        choice_b: optionB,
        choice_c: optionC,
        choice_d: optionD,
        correct_answer: correctAnswer,
        released: 'false',
        timer: 0
      }, function(err, items) {});
    }
  });
  res.redirect('/control_panel');
});
/*
 * Other Functions
 */
var earthshakingQuestions = [];
var mindblowingQuestions = [];
var kayangkayaQuestions = [];
var isipisipQuestions = [];
var questionList = [];
var pickers = [];
var picker = null;
var questionDifficulty = null;
var arg0 = [];
var arg1 = [];
var rowsData = [];
var selectedCategories = [];

function shuffle(array) {
  var currentIndex = array.length,
    temporaryValue, randomIndex;
  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}

function selectQuestion(socket, data) {
  var questionID;
  if (questionDifficulty === 'earthshaking') {
    questionID = shuffle(earthshakingQuestions)[0];
  } else if (questionDifficulty === 'mindblowing') {
    questionID = shuffle(mindblowingQuestions)[0];
  } else if (questionDifficulty === 'kayangkaya') {
    questionID = shuffle(kayangkayaQuestions)[0];
  } else if (questionDifficulty === 'isipisip') {
    questionID = shuffle(isipisipQuestions)[0];
  }
  dbPool.collection('questionnaire').find({
    _id: questionID
  }).toArray(function(err, item) {
    if (err) {
      console.log('::Client:: > ' + err);
    } else {
      console.log(item);
      if (selectedCategories.length === 4) {
        selectedCategories = [];
      }
      /*
       * Note: A bug occurs on item[0].category when reloading another
       *       question while the previously unanswered question is
       *       currently on display.
       */
      if (selectedCategories.indexOf(item[0].category) === -1) {
        socket.broadcast.emit('broadcast_question', {
          questions: item,
          questionNumber: data.questionNumber
        });
        dbPool.collection('questionnaire').update({
          _id: questionID
        }, {
          $set: {
            released: 'true'
          }
        }, function(err, updateItem) {
          if (err) {
            console.log('::Client:: > ' + err);
          } else {
            questionDifficulty = '';
            selectedCategories.push(item[0].category);
            // socket.emit('flash_modal', {
            //     status: 'Success',
            //     header: 'Broadcast Question',
            //     message: 'Question has been broadcasted.'
            // });
          }
        });
      } else {
        selectQuestion(socket, data);
      }
    }
  });
}
/*
 * Socket Requests
 */
io.on('connection', function(socket, req, res) {
  connectedClients = [];
  io.emit('request_check_login', true);
  socket.on('client_login', function(data) {
    if (connectedClients.indexOf(data) === -1) {
      connectedClients.push(data);
    }
    socket.broadcast.emit('update_colleges_list', connectedClients);
  });
  socket.on('client_request_question_difficulty', function(data) {
    var diffy = '';
    questionDifficulty = data;
    if (data == 'earthshaking') {
      diffy = 'Earth-Shaking';
    } else if (data == 'mindblowing') {
      diffy = 'Mind-Blowing';
    } else if (data == 'kayangkaya') {
      diffy = 'Kayang-Kaya';
    } else if (data == 'isipisip') {
      diffy = 'Isip-Isip';
    }
    io.emit('flash_modal', {
      status: 'Success',
      header: 'Randomize Difficulty Picker',
      message: picker + ' chose ' + diffy
    });
  });
  socket.on('admin_refresh_client', function(data) {
    socket.broadcast.emit('refresh_client', true);
  });
  socket.on('admin_reload_available_questions', function(data) {
    dbPool.collection('questionnaire').find({}).toArray(function(err, items) {
      io.emit('update_question_table', items);
    });
  });
  socket.on('admin_set_question_difficulty_button', function(data) {
    if (picker === null) {
      socket.emit('flash_modal', {
        status: 'Failed',
        header: 'Randomize Difficulty Picker',
        message: 'Oops! You should randomize a difficulty picker first.'
      });
    } else {
      var diffy = '';
      questionDifficulty = data;
      if (data == 'earthshaking') {
        diffy = 'Earth-Shaking';
      } else if (data == 'mindblowing') {
        diffy = 'Mind-Blowing';
      } else if (data == 'kayangkaya') {
        diffy = 'Kayang-Kaya';
      } else if (data == 'isipisip') {
        diffy = 'Isip-Isip';
      }
      socket.broadcast.emit('flash_modal', {
        status: 'Success',
        header: 'Randomize Difficulty Picker',
        message: picker + ' chose ' + diffy
      });
    }
  });
  socket.on('admin_nullify_question', function(data) {
    dbPool.collection('answersheet').find({
      question_number: data
    }, function(err1, items) {
      if (!err1) {
        for (var i = 0; i < items.length; i++) {
          dbPool.collection('scoreboard').update({
            college: items[i].college
          }, {
            $inc: {
              total_score: parseInt('-' + items[i].score)
            }
          }, function(err2, updateItem) {
            if (!err2) {
              socket.emit('flash_modal', {
                status: 'Success',
                header: 'Broadcast Question',
                message: 'Question has been broadcasted.'
              });
            }
          });
        }
      }
    });
    dbPool.collection('answersheet').remove({
      question_number: data
    }, function(err, items) {});
  });
  socket.on('admin_set_timer', function(data) {
    socket.broadcast.emit('set_timer', data);
  });
  socket.on('admin_start_timer', function(data) {
    socket.broadcast.emit('start_timer', true);
  });
  socket.on('admin_stop_timer', function(data) {
    socket.broadcast.emit('stop_timer', true);
  });
  socket.on('admin_request_check_login', function(data) {
    socket.broadcast.emit('request_check_login', true);
  });
  socket.on('admin_request_difficulty_picker', function(data) {
    dbPool.collection('questionnaire').find({
      difficulty: 'earthshaking',
      released: 'false'
    }).toArray(function(err, items) {
      for (var i = 0; i < items.length; i++) {
        earthshakingQuestions.push(items[i]['_id']);
      }
    });
    dbPool.collection('questionnaire').find({
      difficulty: 'mindblowing',
      released: 'false'
    }).toArray(function(err, items) {
      for (var i = 0; i < items.length; i++) {
        mindblowingQuestions.push(items[i]['_id']);
      }
    });
    dbPool.collection('questionnaire').find({
      difficulty: 'kayangkaya',
      released: 'false'
    }).toArray(function(err, items) {
      for (var i = 0; i < items.length; i++) {
        kayangkayaQuestions.push(items[i]['_id']);
      }
    });
    dbPool.collection('questionnaire').find({
      difficulty: 'isipisip',
      released: 'false'
    }).toArray(function(err, items) {
      for (var i = 0; i < items.length; i++) {
        isipisipQuestions.push(items[i]['_id']);
      }
    });
    dbPool.collection('questionnaire').find({}).toArray(function(err, items) {
      socket.emit('update_question_table', items);
    });
    if (connectedClients.length !== 0) {
      if (pickers.length >= connectedClients.length) {
        pickers = [];
      }
      var nonPickers = connectedClients.filter(function(item) {
        return pickers.indexOf(item) < 0;
      });
      picker = shuffle(nonPickers)[0];
      pickers.push(picker);
      socket.broadcast.emit('flash_modal', {
        status: 'Success',
        header: 'Randomize Difficulty Picker',
        message: 'It\'s now ' + picker + '\'s turn to choose a difficulty.',
        college: picker
      });
    } else {
      socket.broadcast.emit('flash_modal', {
        status: 'Failed',
        header: 'Randomize Difficulty Picker',
        message: 'Oops! No college is online.'
      });
    }
  });
  socket.on('admin_request_question_difficulty', function(data) {
    if (picker === null) {
      socket.emit('flash_modal', {
        status: 'Failed',
        header: 'Request for Question Difficulty',
        message: 'Oops! You should randomize a difficulty picker first.'
      });
    } else {
      socket.broadcast.emit('request_question_difficulty', picker);
    }
  });
  socket.on('admin_broadcast_question', function(data) {
    selectQuestion(socket, data);
  });
  socket.on('admin_populate_questionnaire', function(data) {
    populator(dbPool).populateQuestionnaire();
  });
  socket.on('admin_reset_questionnaire', function(data) {
    populator(dbPool).resetQuestionnaire(function() {});
  });
  socket.on('admin_reset_scoreboard', function(data) {
    populator(dbPool).resetAnswersheet(function() {});
    populator(dbPool).resetScoreboard(function() {
      populator(dbPool).populateScoreboard();
    });
  });
  socket.on('client_score', function(data) {
    dbPool.collection('answersheet').find({
      college: data.college,
      question_id: data.question_id
    }).toArray(function(err, items) {
      if (!err && items.length === 0) {
        dbPool.collection('answersheet').insert({
          college: data.college,
          question_number: data.question_number,
          question_id: data.question_id,
          score: data.score
        }, function(err, items) {});
        dbPool.collection('scoreboard').update({
          college: data.college
        }, {
          $inc: {
            total_score: data.score
          }
        }, function(err, items) {});
      }
    });
  });
  socket.on('admin_broadcast_correct_answer', function(data) {
    socket.broadcast.emit('broadcast_correct_answer', true);
  });
  socket.on('admin_update_scoreboard', function(data) {
    dbPool.collection('scoreboard').find({}).toArray(function(err, items) {
      arg0 = [];
      for (var i = 0; i < items.length; i++) {
        arg0.push(items[i]);
      }
    });
    dbPool.collection('answersheet').find({}).toArray(function(err, items) {
      arg1 = [];
      for (var i = 0; i < items.length; i++) {
        arg1.push(items[i]);
      }
    });
    dbPool.collection('answersheet').aggregate([{
      $group: {
        _id: '$question_number'
      }
    }]).toArray(function(err, items) {
      rowsData = [];
      for (var i = 0; i < items.length; i++) {
        rowsData.push(items[i]);
      }
    });
    socket.broadcast.emit('update_scoreboard', {
      scoreboard: arg0,
      answersheet: arg1,
      rows: rowsData
    });
  });
});
/*
 * HTTP Listener
 */
http.listen(3000, function() {
  console.log('Server running at http://localhost:3000');
});