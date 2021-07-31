'use strict';

class Workout {
  date = new Date();
  id = Date.now().toString().slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription(date) {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April',
                    'May', 'June', 'July', 'August', 'September',
                    'October', 'November', 'December'];
    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[date.getMonth()]
    } ${date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription(this.date);
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription(this.date);
  }

  calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
  }
}

/////////////////////////////////////
///   Application Architecture    ///
/////////////////////////////////////

const sidebar = document.querySelector('.sidebar');
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const resetElement = document.querySelector('.reset-icon');
const fitMarkers = document.querySelector('.fit-markers');
const toggleSidebar = document.querySelector('.collapse');

class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #featureGroup;
  #workout;
  #workouts = [];
  #currentWorkoutEl;
  #sortingKeyFlags = {
    distance: false,
    duration: false,
  };

  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from local storage
    this._getLocalStorage();

    // bound functions
    this._boundNewWorkout = this._newWorkout.bind(this);
    this._boundEditWorkout = this._editWorkout.bind(this);
    this._boundMoveOrEdit = this._moveOrEdit.bind(this);

    // Event Handlers
    form.addEventListener('submit', this._boundNewWorkout);
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._boundMoveOrEdit);
    resetElement.addEventListener('click', this.reset);
    fitMarkers.addEventListener('click', this._fitMarkers.bind(this));
    toggleSidebar.addEventListener('click', this._toggleSidebar);
  }

  _getPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not get your position');
        }
      );
    }
  }

  _loadMap(position) {
    const { latitude, longitude } = position.coords;
    const coords = [latitude, longitude];

    this.#map = L.map('map', { zoomControl: false }).setView(
      coords,
      this.#mapZoomLevel
    );
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    L.control
      .zoom({
        position: 'topright',
      })
      .addTo(this.#map);

    // Add a featureGroup to store all markers
    this.#featureGroup = L.featureGroup().addTo(this.#map);

    // Handling clicks in map
    this.#map.on('click', this._showForm.bind(this));

    this.#workouts.forEach(work => {
      this._renderWorkoutMarker(work);
    });
  }

  _toggleSidebar() {
    sidebar.classList.toggle('hide-sidebar');
  }

  _showForm(e) {
    this.#mapEvent = e;
    this._clearInput();
    sidebar.classList.remove('hide-sidebar');
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _fitMarkers() {
    if (this.#featureGroup.getBounds()?._southWest)
      this.#map.fitBounds(this.#featureGroup.getBounds(), {
        padding: L.point(50, 50),
      });
    sidebar.classList.add('hide-sidebar');
  }

  _hideForm() {
    this._clearInput();
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _clearInput() {
    // prettier-ignore
    inputDistance.value = inputDuration.value = inputCadence.value = inputElevation.value = '';
    if (inputType.getAttribute('disabled'))
      inputType.setAttribute('disabled', false);

    // For mobile
    setTimeout(() => sidebar.classList.add('hide-sidebar'), 1000);
  }

  _toggleElevationField() {
    [inputElevation, inputCadence].forEach(el => {
      el.closest('.form__row').classList.toggle('form__row--hidden');
    });
  }

  _newWorkout(e) {
    // get new workout object
    const validated = this._getWorkoutObject(e);
    if (!validated) return;

    // Add new object to workout array
    this.#workout = validated;
    this.#workouts.push(this.#workout);

    // Render workout on map as marker
    this._renderWorkoutMarker(this.#workout);

    // Render wokout on list
    this._renderWorkout(this.#workout);

    // Hide form + clear input fields
    this._hideForm();

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  _validateFields() {
    // Check if data is valid
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));

    const isPositive = (...inputs) => inputs.every(inp => inp > 0);

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    // If workout running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;

      if (
        !validInputs(distance, duration, cadence) ||
        !isPositive(distance, duration, cadence)
      ) {
        return false;
      }
      return [type, distance, duration, cadence];
    }

    // If workout cycling, return cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;

      if (
        !validInputs(distance, duration, elevation) ||
        !isPositive(distance, duration)
      ) {
        return false;
      }
      return [type, distance, duration, elevation];
    }
  }

  _getWorkoutObject(e) {
    e.preventDefault();

    // Validate the form
    const validated = this._validateFields();
    if (!validated) return alert('Inputs have to be positive numbers!');

    // Get data from the from
    const [type, ...inputs] = validated;
    const { lat, lng } = this.#mapEvent.latlng;

    // Create an object based on the type
    if (type === 'running') return new Running([lat, lng], ...inputs);
    if (type === 'cycling') return new Cycling([lat, lng], ...inputs);

    // clear the input fields
    this._clearInput();
  }

  _renderWorkoutMarker(workout) {
    const typeEmoji = workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️';

    const m = L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(`${typeEmoji} ${workout.description}`)
      .openPopup();

    this.#featureGroup.addLayer(m);
  }

  _renderWorkout(workout) {
    const typeEmoji = workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️';
    const paceSpeed = workout?.pace ?? workout.speed;
    const paceSpeedMark = workout.type === 'running' ? 'min/km' : 'km/min';
    const cadenceGainEmoji = workout.type === 'running' ? '🦶🏼' : '⛰';
    const cadenceGain = workout?.cadence ?? workout.elevationGain;
    const cadenceGainMark = workout.type === 'running' ? 'spm' : 'm';
    let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <h2 class="workout__title">${workout.description}</h2>
        <div class="edit-bar hide-bar">
          <p class="edit">Edit</p>
          <p class="delete">Delete</p>
        </div>
        <div class="v-dots"><div></div></div>
        <div class="workout__details" data-key="distance">
          <span class="workout__icon">${typeEmoji}</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">
            km <span class="sort-arrow hide-arrow">↕️</span>
          </span>
        </div>
        <div class="workout__details" data-key="duration">
          <span class="workout__icon">⏱</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">
            min <span class="sort-arrow hide-arrow">↕️</span>
          </span>
          </div>
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${paceSpeed.toFixed(1)}</span>
          <span class="workout__unit">${paceSpeedMark}</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">${cadenceGainEmoji}</span>
          <span class="workout__value">${cadenceGain}</span>
          <span class="workout__unit">${cadenceGainMark}</span>
        </div>
      </li>`;

    form.insertAdjacentHTML('afterend', html);
  }

  _renderAllWorkouts(key = null) {
    containerWorkouts.querySelectorAll('.workout').forEach(el => el.remove());
    const workouts = key
      ? this.#workouts.slice().sort((w1, w2) => w2[key] - w1[key])
      : this.#workouts;
    workouts.forEach(work => this._renderWorkout(work));
  }

  _editWorkout(e) {
    e.preventDefault();

    const validated = this._validateFields();
    if (!validated) return alert('Inputs have to be positive numbers!');

    const [type, distance, duration, lastVar] = validated;
    this.#workout.distance = distance;
    this.#workout.duration = duration;

    // Update the object based on the type
    if (type === 'running') {
      this.#workout.cadence = lastVar;
      this.#workout.calcPace();
    }

    if (type === 'cycling') {
      this.#workout.elevationGain = lastVar;
      this.#workout.calcSpeed();
    }
    this._renderWorkout(this.#workout);

    // clear the input fields
    this._hideForm();
    form.removeEventListener('submit', this._boundEditWorkout);
    form.addEventListener('submit', this._boundNewWorkout);

    // Update the local storage
    this._setLocalStorage();

    this.#currentWorkoutEl.remove();
    this.#currentWorkoutEl = null;
  }

  _moveOrEdit(e) {
    const editEl = e.target.closest('.edit');
    const deleteEl = e.target.closest('.delete');
    const editDots = e.target.closest('.v-dots');
    const workoutEl = e.target.closest('.workout');
    const workoutDetails = e.target.closest('.workout__details');
    const workout = this.#workouts.find(
      work => work.id === workoutEl?.dataset.id
    );
    if (workout) this.#workout = workout;

    if (workoutDetails?.dataset?.key) {
      const key = workoutDetails.dataset.key;

      if (this.#sortingKeyFlags[key]) {
        this._renderAllWorkouts();
      } else {
        this._renderAllWorkouts(key);
        document.querySelectorAll('.workout__details').forEach(el => {
          if (el.dataset?.key === key) {
            el.querySelector('.sort-arrow').classList.remove('hide-arrow');
          }
        });
      }
      this.#sortingKeyFlags[key] = !this.#sortingKeyFlags[key];
    }

    if (
      deleteEl
    ) {
      this.#workouts.splice(this.#workouts.indexOf(workout), 1);
      this._setLocalStorage();
      location.reload();
    }

    // prettier-ignore
    else if (editEl) {
      if (this.#currentWorkoutEl) {
        this.#currentWorkoutEl.classList.remove('workout-hidden');
      }
      this.#currentWorkoutEl = workoutEl;

      // prettier-ignore
      const { type, distance, duration, cadence, elevationGain } = this.#workout;
      workoutEl.classList.add('workout-hidden');
      inputType.value = type;
      inputType.setAttribute('disabled', true);

      inputDistance.value = distance;
      inputDuration.value = duration;
      inputCadence.value = cadence;
      inputElevation.value = elevationGain;

      if (type === 'running') {
        inputElevation.closest('.form__row').classList.add('form__row--hidden');
        inputCadence
          .closest('.form__row')
          .classList.remove('form__row--hidden');
      }

      if (type === 'cycling') {
        inputCadence.closest('.form__row').classList.add('form__row--hidden');
        inputElevation
          .closest('.form__row')
          .classList.remove('form__row--hidden');
      }

      form.classList.remove('hidden');
      inputDistance.focus();
      form.removeEventListener('submit', this._boundNewWorkout);
      form.addEventListener('submit', this._boundEditWorkout);
    }

    if (editDots) {
      const editBar = workoutEl.querySelector('.edit-bar');
      editBar.classList.toggle('hide-bar');
      const helper = function (e) {
        if (e.target !== editDots) {
          editBar.classList.add('hide-bar');
          this.removeEventListener('click', helper);
        }
      };
      document.addEventListener('click', helper);
    } else if (workoutEl) {
      if (!editEl && !workoutDetails?.dataset?.key && !deleteEl)
        sidebar.classList.add('hide-sidebar');

      this.#map.setView(this.#workout.coords, this.#mapZoomLevel, {
        animate: true,
        pan: {
          duration: 1,
        },
      });
      this.#workout.click();
    }
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;
    data.forEach(rawData => {
      // prettier-ignore
      const { type, coords, distance, duration, cadence, elevationGain } = rawData;
      let workout;

      if (type === 'running')
        workout = new Running(coords, distance, duration, cadence);
      else if (type === 'cycling')
        workout = new Cycling(coords, distance, duration, elevationGain);

      workout.description = rawData.description;
      workout.date = rawData.date;
      workout.id = rawData.id;

      this.#workouts.push(workout);
    });

    this.#workouts.forEach(work => this._renderWorkout(work));
  }

  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
